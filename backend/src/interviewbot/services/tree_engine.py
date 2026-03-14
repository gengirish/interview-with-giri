"""Decision tree engine for dynamic interview branching."""


def validate_tree(tree_data: dict) -> dict:
    """Validate a decision tree has no dead ends and all nodes are reachable."""
    nodes = tree_data.get("nodes", [])
    if not nodes:
        return {"valid": False, "errors": ["Tree has no nodes"]}

    errors = []
    node_map = {n["id"]: n for n in nodes}

    # Check for entry node
    entry_nodes = [n for n in nodes if n.get("type") == "entry"]
    if len(entry_nodes) != 1:
        errors.append("Tree must have exactly one entry node")

    # Check for exit node
    exit_nodes = [n for n in nodes if n.get("type") == "exit"]
    if not exit_nodes:
        errors.append("Tree must have at least one exit node")

    # Check all references are valid
    for node in nodes:
        if node.get("next") and node["next"] not in node_map:
            errors.append(
                f"Node '{node['id']}' references non-existent node '{node['next']}'"
            )
        for branch in node.get("branches", []):
            if branch.get("next") and branch["next"] not in node_map:
                errors.append(
                    f"Branch in '{node['id']}' references non-existent node '{branch['next']}'"
                )

    # Check reachability (BFS from entry)
    if entry_nodes:
        visited = set()
        queue = [entry_nodes[0]["id"]]
        while queue:
            current_id = queue.pop(0)
            if current_id in visited:
                continue
            visited.add(current_id)
            node = node_map.get(current_id)
            if not node:
                continue
            if node.get("next"):
                queue.append(node["next"])
            for branch in node.get("branches", []):
                if branch.get("next"):
                    queue.append(branch["next"])

        unreachable = set(node_map.keys()) - visited
        if unreachable:
            errors.append(f"Unreachable nodes: {', '.join(unreachable)}")

    return {"valid": len(errors) == 0, "errors": errors}


def evaluate_branch(branches: list[dict], block_score: float) -> str | None:
    """Evaluate branch conditions and return the next node ID."""
    for branch in branches:
        condition = branch.get("condition", "always")
        next_node = branch.get("next")
        if condition == "always":
            return next_node
        # Parse condition like "score >= 8"
        try:
            parts = condition.replace("score", "").strip().split()
            if len(parts) == 2:
                op, value = parts[0], float(parts[1])
                if op == ">=" and block_score >= value:
                    return next_node
                elif op == "<=" and block_score <= value:
                    return next_node
                elif op == ">" and block_score > value:
                    return next_node
                elif op == "<" and block_score < value:
                    return next_node
                elif op == "==" and block_score == value:
                    return next_node
        except (ValueError, IndexError):
            continue
    # Fallback: return last branch
    return branches[-1].get("next") if branches else None


def initialize_tree_state(tree_data: dict) -> dict:
    """Initialize the tree state when an interview starts."""
    nodes = tree_data.get("nodes", [])
    entry = next((n for n in nodes if n.get("type") == "entry"), None)
    if not entry:
        return {}
    first_node = entry.get("next", None)
    return {
        "current_node": first_node,
        "path_taken": ["start"],
        "node_scores": {},
        "questions_asked": 0,
    }


def advance_tree(tree_data: dict, tree_state: dict, block_score: float) -> dict:
    """Advance to the next node based on the score from the current block."""
    nodes = tree_data.get("nodes", [])
    node_map = {n["id"]: n for n in nodes}
    current_id = tree_state.get("current_node")
    current_node = node_map.get(current_id)

    if not current_node:
        return tree_state

    # Record score for current node
    tree_state["node_scores"][current_id] = block_score
    tree_state["path_taken"].append(current_id)

    # Evaluate branches
    branches = current_node.get("branches", [])
    if branches:
        next_id = evaluate_branch(branches, block_score)
    else:
        next_id = current_node.get("next")

    tree_state["current_node"] = next_id
    return tree_state


def get_current_node_config(tree_data: dict, tree_state: dict) -> dict | None:
    """Get the config for the current node."""
    nodes = tree_data.get("nodes", [])
    node_map = {n["id"]: n for n in nodes}
    current_id = tree_state.get("current_node")
    node = node_map.get(current_id)
    if node and node.get("type") == "question_block":
        return node.get("config", {})
    return None


def compute_path_analytics(sessions_tree_states: list[dict], tree_data: dict) -> dict:
    """Compute which paths are most commonly taken."""
    path_counts = {}
    for state in sessions_tree_states:
        path = tuple(state.get("path_taken", []))
        path_str = " -> ".join(path)
        path_counts[path_str] = path_counts.get(path_str, 0) + 1

    total = len(sessions_tree_states) or 1
    return {
        "paths": [
            {"path": p, "count": c, "percentage": round(c / total * 100, 1)}
            for p, c in sorted(path_counts.items(), key=lambda x: -x[1])
        ],
        "total_sessions": len(sessions_tree_states),
    }
