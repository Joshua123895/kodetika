import { ensurePyodide } from "./pyodide";

// A pattern may open with `(?i)` to ask for a case-insensitive match. JS regexes
// have no inline-modifier syntax old enough to rely on, so the prefix is stripped
// and turned into the real flag. SQL levels are why this exists: the language is
// case-insensitive, `group by` and `GROUP BY` are the same code, and a check that
// accepted only one spelling would reject a correct answer.
export function compilePattern(pat) {
  const ci = pat.startsWith("(?i)");
  return new RegExp(ci ? pat.slice(4) : pat, ci ? "i" : "");
}

export async function validateStructure(code, sourceChecks) {
  if (!sourceChecks) return { valid: true };

  // Code-pattern checks (value-based, used by game goals). These run as plain
  // JS regexes against the raw code, so no Pyodide load is needed for levels
  // that only use them. `contains` = every pattern must appear; `absent` = none
  // may appear. A friendly `failMessage` is shown when a check fails.
  const patternFail = sourceChecks.failMessage || "Not quite yet, check the goal and try again.";
  if (sourceChecks.contains) {
    for (const pat of sourceChecks.contains) {
      let re;
      try {
        re = compilePattern(pat);
      } catch {
        continue;
      }
      if (!re.test(code)) return { valid: false, error: patternFail };
    }
  }
  if (sourceChecks.absent) {
    for (const pat of sourceChecks.absent) {
      let re;
      try {
        re = compilePattern(pat);
      } catch {
        continue;
      }
      if (re.test(code)) return { valid: false, error: patternFail };
    }
  }

  // Only the AST-based checks below need Pyodide; skip loading it otherwise.
  const needsAst =
    sourceChecks.classes ||
    sourceChecks.functions ||
    sourceChecks.methods ||
    sourceChecks.inheritance ||
    sourceChecks.not;
  if (!needsAst) return { valid: true };

  const pyodide = await ensurePyodide();

  try {
    pyodide.globals.set("__check_code__", code);
    const raw = pyodide.runPython(`
import ast, json

tree = ast.parse(__check_code__)

classes = []
functions = []
class_methods = {}
inheritance = {}
used_names = set()

for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        classes.append(node.name)
        bases = []
        for base in node.bases:
            if isinstance(base, ast.Name):
                bases.append(base.id)
            elif isinstance(base, ast.Attribute):
                bases.append(base.attr)
        if bases:
            inheritance[node.name] = bases
        for item in node.body:
            if isinstance(item, ast.FunctionDef):
                if node.name not in class_methods:
                    class_methods[node.name] = []
                class_methods[node.name].append(item.name)

for node in tree.body:
    if isinstance(node, ast.FunctionDef):
        functions.append(node.name)
for node in ast.walk(tree):
    if isinstance(node, ast.Name):
        used_names.add(node.id)
    elif isinstance(node, ast.Attribute):
        used_names.add(node.attr)
    elif isinstance(node, ast.Import):
        for a in node.names:
            used_names.add(a.name.split(".")[0])
    elif isinstance(node, ast.ImportFrom):
        if node.module:
            used_names.add(node.module.split(".")[0])
        for a in node.names:
            used_names.add(a.name)

json.dumps({
    "classes": classes,
    "functions": functions,
    "classMethods": class_methods,
    "inheritance": inheritance,
    "usedNames": sorted(used_names)
})
`);

    return checkAstResult(JSON.parse(raw), sourceChecks);
  } catch (e) {
    return { valid: false, error: `Could not parse your code: ${e.message}` };
  }
}

/**
 * Compares what Python's ast module found against the level's checks.
 * Split out from validateStructure so it can be unit tested without loading
 * Pyodide: `result` is the JSON the harness above prints, i.e.
 * { classes, functions, classMethods, inheritance, usedNames }.
 */
export function checkAstResult(result, sourceChecks) {
  if (sourceChecks.classes) {
    for (const required of sourceChecks.classes) {
      if (!(result.classes || []).includes(required)) {
        return { valid: false, error: `Class "${required}" not found in your code.` };
      }
    }
  }

  if (sourceChecks.functions) {
    for (const required of sourceChecks.functions) {
      if (!(result.functions || []).includes(required)) {
        const classMethods = result.classMethods || {};
        const owner = Object.keys(classMethods).find((c) => classMethods[c].includes(required));
        if (owner) {
          return {
            valid: false,
            error: `"${required}" is a method of class "${owner}", not a top-level function. This level's checks should use methods, not functions.`,
          };
        }
        return { valid: false, error: `Function "${required}" not found in your code.` };
      }
    }
  }

  if (sourceChecks.inheritance) {
    // The documented YAML form is `inh: {Child: [Parent]}` — an ARRAY. This used
    // to compare `bases.includes(parent)` against that array directly, which is
    // never true, while the error message stringified ["Dog"] to Dog and so read
    // as though it were correct. Any level written per the docs was permanently
    // unpassable. Accept both the array and a bare string.
    for (const [child, required] of Object.entries(sourceChecks.inheritance)) {
      const parents = Array.isArray(required) ? required : [required];
      const bases = (result.inheritance || {})[child] || [];
      const missing = parents.find((p) => !bases.includes(p));
      if (missing) {
        return { valid: false, error: `Class "${child}" does not inherit from "${missing}".` };
      }
    }
  }

  if (sourceChecks.methods) {
    for (const [className, methods] of Object.entries(sourceChecks.methods)) {
      const existingMethods = (result.classMethods || {})[className] || [];
      for (const method of methods) {
        if (!existingMethods.includes(method)) {
          return { valid: false, error: `Method "${method}" not found in class "${className}".` };
        }
      }
    }
  }

  if (sourceChecks.not) {
    const banned = Array.isArray(sourceChecks.not) ? sourceChecks.not : [sourceChecks.not];
    for (const name of banned) {
      if ((result.usedNames || []).includes(name)) {
        return { valid: false, error: `This level does not allow using "${name}".` };
      }
    }
  }

  return { valid: true };
}
