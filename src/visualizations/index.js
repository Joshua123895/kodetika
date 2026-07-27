import StackViz from "./StackViz";
import LinkedListViz from "./LinkedListViz";
import ArrayViz from "./ArrayViz";
import QueueViz from "./QueueViz";
import HashViz from "./HashViz";
import TreeViz from "./TreeViz";
import HeapViz from "./HeapViz";
import GraphViz from "./GraphViz";
import SortViz from "./SortViz";
import PointerViz from "./PointerViz";
import TraversalViz from "./TraversalViz";
import HashMapViz from "./HashMapViz";
import GraphAlgoViz from "./GraphAlgoViz";
import DPViz from "./DPViz";
import BacktrackViz from "./BacktrackViz";
import GreedyViz from "./GreedyViz";
import GradientViz from "./GradientViz";
import RegressionViz from "./RegressionViz";

export const VISUALIZATIONS = {
  stack: StackViz,
  linked_list: LinkedListViz,
  array: ArrayViz,
  queue: QueueViz,
  hash_table: HashViz,
  tree: TreeViz,
  heap: HeapViz,
  graph: GraphViz,
  sort: SortViz,
  pointers: PointerViz,
  tree_traversal: TraversalViz,
  hash_map: HashMapViz,
  graph_algo: GraphAlgoViz,
  dp: DPViz,
  backtrack: BacktrackViz,
  greedy: GreedyViz,
  gradient_descent: GradientViz,
  regression_fit: RegressionViz,
};

export function getVisualization(name) {
  return VISUALIZATIONS[name] || null;
}
