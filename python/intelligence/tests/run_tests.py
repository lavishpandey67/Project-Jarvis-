import unittest
import sys
import os

# Ensure current working directory is on python module path
sys.path.insert(0, os.path.abspath("."))

def run_all_tests():
    loader = unittest.TestLoader()
    suite = loader.discover('python/intelligence/tests', pattern='test_*.py')
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    if not result.wasSuccessful():
        sys.exit(1)

if __name__ == "__main__":
    run_all_tests()
