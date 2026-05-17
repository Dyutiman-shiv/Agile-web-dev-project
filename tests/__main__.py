"""Allow ``python -m tests <category>`` — forwards to ``tests.run_tests``."""

from tests.run_tests import main

raise SystemExit(main())
