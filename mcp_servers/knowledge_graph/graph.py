import json
import os
from datetime import datetime
from collections import deque


# Store knowledge graph JSON files relative to the project root
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "knowledge_graphs")


class KnowledgeGraph:
    """Persistent knowledge graph tracking what concepts a user understands.

    Each concept has:
    - confidence: 0.0 to 1.0 (how well they understand it)
    - prerequisites: list of concept names they should know first
    - source: where they learned it (paper + section)
    - last_updated: timestamp

    Stored as a JSON file per user in data/knowledge_graphs/.
    """

    def __init__(self, user_id="default"):
        self.user_id = user_id
        self.data = {"user_id": user_id, "concepts": {}}
        os.makedirs(DATA_DIR, exist_ok=True)
        self._load()

    @property
    def _file_path(self):
        return os.path.join(DATA_DIR, f"{self.user_id}.json")

    def _load(self):
        if os.path.exists(self._file_path):
            with open(self._file_path, "r") as f:
                self.data = json.load(f)

    def _save(self):
        with open(self._file_path, "w") as f:
            json.dump(self.data, f, indent=2)

    @property
    def concepts(self):
        return self.data["concepts"]

    def get_concept(self, name):
        """Look up a single concept by name."""
        return self.concepts.get(name.lower().strip())

    def add_concept(self, name, confidence=0.5, prerequisites=None, source=""):
        """Add or overwrite a concept in the graph."""
        name = name.lower().strip()
        self.concepts[name] = {
            "confidence": max(0.0, min(1.0, confidence)),
            "prerequisites": [p.lower().strip() for p in (prerequisites or [])],
            "source": source,
            "last_updated": datetime.now().isoformat(),
        }
        self._save()
        return self.concepts[name]

    def update_confidence(self, name, new_confidence):
        """Adjust a concept's confidence score. Returns None if not found."""
        name = name.lower().strip()
        if name not in self.concepts:
            return None
        self.concepts[name]["confidence"] = max(0.0, min(1.0, new_confidence))
        self.concepts[name]["last_updated"] = datetime.now().isoformat()
        self._save()
        return self.concepts[name]

    def remove_concept(self, name):
        """Delete a concept and clean up references to it."""
        name = name.lower().strip()
        if name not in self.concepts:
            return False
        del self.concepts[name]
        for concept in self.concepts.values():
            if name in concept["prerequisites"]:
                concept["prerequisites"].remove(name)
        self._save()
        return True

    def find_prerequisite_gaps(self, target, min_confidence=0.3):
        """BFS through prerequisites to find concepts the user is missing or weak on.

        Returns a list sorted so the most foundational gaps come first
        (deepest in the prerequisite chain = should learn first).
        """
        target = target.lower().strip()
        target_data = self.concepts.get(target)
        if not target_data:
            return []

        gaps = []
        visited = set()
        queue = deque()

        for prereq in target_data["prerequisites"]:
            queue.append((prereq.lower().strip(), 1))

        while queue:
            name, depth = queue.popleft()
            if name in visited:
                continue
            visited.add(name)

            concept_data = self.concepts.get(name)

            if concept_data is None:
                # Not in graph at all
                gaps.append({
                    "concept": name,
                    "confidence": 0.0,
                    "depth": depth,
                    "status": "unknown",
                })
            elif concept_data["confidence"] < min_confidence:
                # In graph but weak
                gaps.append({
                    "concept": name,
                    "confidence": concept_data["confidence"],
                    "depth": depth,
                    "status": "weak",
                })
                for sub in concept_data["prerequisites"]:
                    if sub not in visited:
                        queue.append((sub, depth + 1))
            else:
                # User knows this — still check deeper
                for sub in concept_data["prerequisites"]:
                    if sub not in visited:
                        queue.append((sub, depth + 1))

        # Most foundational first (deepest), then weakest
        gaps.sort(key=lambda g: (-g["depth"], g["confidence"]))
        return gaps

    def get_learning_path(self, target):
        """Topological order of concepts needed to understand the target.

        Uses DFS post-order: prerequisites come before concepts that
        depend on them. Most foundational concepts first.
        """
        target = target.lower().strip()
        if target not in self.concepts:
            return []

        path = []
        visited = set()

        def dfs(name):
            if name in visited:
                return
            visited.add(name)
            concept_data = self.concepts.get(name)
            if concept_data:
                for prereq in concept_data["prerequisites"]:
                    dfs(prereq)
            path.append({
                "concept": name,
                "confidence": concept_data["confidence"] if concept_data else 0.0,
                "known": concept_data is not None and concept_data["confidence"] >= 0.3,
            })

        dfs(target)
        return path

    def get_related_concepts(self, name):
        """Get direct prerequisites and dependents of a concept."""
        name = name.lower().strip()
        concept_data = self.concepts.get(name)

        prerequisites = concept_data["prerequisites"] if concept_data else []
        dependents = [
            n for n, data in self.concepts.items()
            if name in data["prerequisites"]
        ]

        return {
            "concept": name,
            "exists": concept_data is not None,
            "prerequisites": prerequisites,
            "dependents": dependents,
        }
