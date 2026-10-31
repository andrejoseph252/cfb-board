"""Checks for the equal-weight consensus metric: python3 -m unittest discover -s scripts."""
import unittest

from ballots import rank_disagreement


class ConsensusTests(unittest.TestCase):
    def setUp(self):
        self.ballot = [str(i) for i in range(1, 26)]

    def test_identical_ballots(self):
        self.assertEqual(rank_disagreement([self.ballot] * 3), 0)

    def test_adjacent_swaps_have_equal_weight_at_every_rank(self):
        for i in range(24):
            changed = self.ballot.copy()
            changed[i], changed[i + 1] = changed[i + 1], changed[i]
            self.assertAlmostEqual(rank_disagreement([self.ballot, changed]), 2 / 25)

    def test_omissions_and_cutoff_ties(self):
        changed = self.ballot[:-1] + ['other']
        # Both one-point teams tie for #25 and each has a one-place gap (25 vs NR).
        self.assertAlmostEqual(rank_disagreement([self.ballot, changed]), 2 / 26)

    def test_teams_outside_top_25_do_not_affect_average(self):
        b = self.ballot[:-1] + ['other']
        c = self.ballot[:-1] + ['third']
        # Original #25 earns two points, the other tail teams earn only one each.
        self.assertAlmostEqual(rank_disagreement([self.ballot, self.ballot, b, c]), 4 / (6 * 25))

    def test_voter_order_does_not_matter(self):
        changed = list(reversed(self.ballot))
        self.assertEqual(rank_disagreement([self.ballot, changed, self.ballot]),
                         rank_disagreement([changed, self.ballot, self.ballot]))


if __name__ == '__main__':
    unittest.main()
