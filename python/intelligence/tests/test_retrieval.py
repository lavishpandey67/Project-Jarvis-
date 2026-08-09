import unittest
from python.intelligence.retrieval.semantic import SemanticRetrievalEngine

class TestSemanticRetrieval(unittest.TestCase):

    def setUp(self):
        self.engine = SemanticRetrievalEngine()
        self.candidates = [
            {
                "id": "mem_1",
                "title": "AI Lead Ops Core Architecture",
                "content": "Selected event-driven architecture using PostgreSQL and Drizzle ORM.",
                "projectId": "proj_lead_ops",
                "importance": 5,
                "validity": "FACT",
            },
            {
                "id": "mem_2",
                "title": "Lead Deduplication Lesson",
                "content": "Synchronous lead deduplication prior to triggering AI enrichment.",
                "projectId": "proj_lead_ops",
                "importance": 4,
                "validity": "LESSON",
            },
            {
                "id": "mem_3",
                "title": "Other Project Config",
                "content": "Unrelated configuration for project B.",
                "projectId": "proj_other",
                "importance": 3,
                "validity": "FACT",
            },
            {
                "id": "mem_4",
                "title": "Invalidated Assumption",
                "content": "Old assumption about memory cache.",
                "projectId": "proj_lead_ops",
                "importance": 2,
                "validity": "INVALIDATED",
            }
        ]

    def test_project_isolation(self):
        result = self.engine.retrieve_context(
            query="Lead Ops Architecture",
            candidates=self.candidates,
            project_id="proj_lead_ops",
            allow_cross_project=False
        )
        returned_ids = [item["record"]["id"] for item in result["scoredItems"]]
        self.assertIn("mem_1", returned_ids)
        self.assertIn("mem_2", returned_ids)
        self.assertNotIn("mem_3", returned_ids)  # Cross-project isolated
        self.assertNotIn("mem_4", returned_ids)  # Invalidated filtered out

    def test_ranking_order(self):
        result = self.engine.retrieve_context(
            query="deduplication enrichment token cost",
            candidates=self.candidates,
            project_id="proj_lead_ops"
        )
        top_item = result["scoredItems"][0]
        self.assertEqual(top_item["record"]["id"], "mem_2")

if __name__ == "__main__":
    unittest.main()
