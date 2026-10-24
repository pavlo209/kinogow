import unittest
from unittest import mock

from svitlo import cards


class FontFallbackTest(unittest.TestCase):
    def test_cards_render_without_noto_fonts(self):
        missing = "/nonexistent/font.ttf"
        with mock.patch.object(cards, "_FONT", missing), mock.patch.object(cards, "_FONT_BOLD", missing):
            cards._font.cache_clear()
            try:
                png = cards.render_guide()
            finally:
                cards._font.cache_clear()
        self.assertTrue(png.startswith(b"\x89PNG"))


if __name__ == "__main__":
    unittest.main()
