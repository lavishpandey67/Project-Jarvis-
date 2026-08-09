import unittest
from python.intelligence.app.contract import IntelligenceRequest, IntelligenceResponse
from python.intelligence.app.server import process_intelligence_request

class TestContract(unittest.TestCase):

    def test_request_contract_parsing(self):
        data = {
            "requestId": "req_123",
            "taskId": "task_456",
            "projectId": "proj_lead_ops",
            "operation": "PREDICT_DIFFICULTY",
            "inputData": {"objective": "Build AI Lead Operations System"}
        }
        req = IntelligenceRequest.from_dict(data)
        self.assertEqual(req.request_id, "req_123")
        self.assertEqual(req.operation, "PREDICT_DIFFICULTY")

    def test_process_intelligence_request_end_to_end(self):
        data = {
            "requestId": "req_retrieval",
            "operation": "SEMANTIC_RETRIEVAL",
            "inputData": {
                "query": "Lead Ops Architecture",
                "candidates": [
                    {"id": "m1", "title": "Lead Ops Core", "content": "PostgreSQL Drizzle schema", "projectId": "proj_1"}
                ],
                "projectId": "proj_1"
            }
        }
        res_dict = process_intelligence_request(data)
        self.assertEqual(res_dict["requestId"], "req_retrieval")
        self.assertEqual(res_dict["status"], "success")
        self.assertIn("scoredItems", res_dict["output"])

if __name__ == "__main__":
    unittest.main()
