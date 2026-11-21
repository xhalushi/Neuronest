import unittest
from unittest.mock import patch
import numpy as np
from picture import features, PRE, POST, LOWPASS, UnusableCue
from scipy.signal import sosfiltfilt
from unicorn import EEG, SETTLING_SAMPLES


class PictureTests(unittest.TestCase):
    def block(self, count):
        frame = np.ones((count, 11))
        t = np.arange(count) / 250
        frame[:, :8] = (8*np.sin(2*np.pi*6*t))[:, None]
        return frame

    def test_event_alignment_and_rejection_after_invalid_sample(self):
        eeg = EEG()
        with patch('unicorn.time.monotonic', return_value=10):
            eeg.push(self.block(SETTLING_SAMPLES + 200))
            mark, invalid = eeg.picture_marker()
            with self.assertRaisesRegex(ValueError, 'late'):
                eeg.picture_epoch(mark, invalid)
            # A 340–440 ms synthetic ERP lands in the third 100 ms feature bin.
            for start in range(0, POST, 25):
                frame = self.block(25)
                sample = start + np.arange(25)
                frame[(sample >= 85) & (sample < 110), :8] += 40
                eeg.push(frame)
            vector = eeg.picture_epoch(mark, invalid)
            self.assertEqual(len(vector), 8)
            self.assertEqual(len(vector[2]), 6)
            self.assertEqual(np.argmax(vector[2]), 2)
            frame[0, 10] = 0
            eeg.push(frame)
            with self.assertRaisesRegex(ValueError, 'interrupted'):
                eeg.picture_epoch(mark, invalid)
        with patch('unicorn.time.monotonic', return_value=11):
            with self.assertRaises(ValueError):
                eeg.picture_marker()

    def test_bad_channels_are_excluded_and_missing_central_contact_rejected(self):
        data = self.block(PRE + POST)[:, :8].copy()
        data[:, 0] = 0
        self.assertIsNone(features(data, 350)[0])
        data[:, [2, 4]] *= 2000
        with self.assertRaisesRegex(ValueError, 'Cz range'):
            features(data, 350)

    def test_reported_central_spans_with_picture_trial_limit(self):
        data = self.block(PRE + POST)[:, :8].copy()
        base_span = np.ptp(sosfiltfilt(LOWPASS, data[:, 2]))
        data[:, 2] *= 2210 / base_span
        data[:, 4] *= 2245 / base_span
        with self.assertRaises(UnusableCue):
            features(data, 2200)
        self.assertTrue(all(value is not None for value in features(data, 2400)))
        data[:, [2, 4]] *= 2
        with self.assertRaises(UnusableCue):
            features(data, 2400)

    def test_continuous_filter_is_independent_of_sdk_block_size(self):
        data = self.block(SETTLING_SAMPLES + 500)
        data[:, :8] += np.linspace(0, 100, len(data))[:, None]
        readers = [EEG(), EEG()]
        with patch('unicorn.time.monotonic', return_value=10):
            readers[0].push(data)
            for start in range(0, len(data), 5):
                readers[1].push(data[start:start+5])
        np.testing.assert_allclose(readers[0].erp_rows, readers[1].erp_rows)
        self.assertEqual(len(readers[0].erp_rows), len(readers[0].rows))

    def test_continuous_filter_rejects_slow_drift_and_retains_erp_band(self):
        from picture import ERP_BANDPASS
        from scipy.signal import sosfreqz
        _, response = sosfreqz(ERP_BANDPASS, worN=[.05, 3, 60], fs=250)
        self.assertLess(abs(response[0]), .02)
        self.assertGreater(abs(response[1]), .9)
        self.assertLess(abs(response[2]), .05)
