import unittest
import threading
from unittest.mock import patch
import numpy as np
from unicorn import EEG, acquire, SETTLING_SAMPLES
from ssvep import WINDOW

class EEGTests(unittest.TestCase):
    def feed_settled_window(self, reader, frame):
        reader.push(np.ones((SETTLING_SAMPLES, 11)))
        reader.push(frame)

    def test_range_trial_applies_to_scores_and_watchdog(self):
        t = np.arange(WINDOW)/250
        frame = np.ones((WINDOW, 11))
        frame[:, :8] = 500*np.sin(2*np.pi*6*t)[:, None]
        for limit, accepted in ((350, False), (2200, True)):
            reader = EEG(limit)
            self.feed_settled_window(reader, frame)
            self.assertEqual(reader.frequency_ready(), accepted)
            self.assertEqual(reader.snapshot()['scores'] is not None, accepted)
        reader.push(frame * np.array([5]*8 + [1]*3))
        self.assertFalse(reader.frequency_ready())
        self.assertIn('limit 2200', reader.snapshot()['signalIssues'][0])
        for limit in (0, float('nan'), float('inf')):
            with self.assertRaises(ValueError):
                EEG(limit)

    def test_live_alpha_and_invalid_scan(self):
        e=EEG()
        t=np.arange(WINDOW)/250
        frame=np.ones((WINDOW,11))
        frame[:,:8]=np.sin(2*np.pi*10*t)[:,None]*10
        frame[:,8]=85
        self.feed_settled_window(e, frame)
        packet=e.snapshot()
        self.assertEqual(packet['state'],'ready')
        self.assertIn('Oz',packet['powers'])
        broken=frame[:5].copy();broken[-1,10]=0;e.push(broken)
        self.assertEqual(e.snapshot()['state'],'warming')
        self.assertEqual(e.snapshot()['bufferedSamples'],0)
        self.assertEqual(e.snapshot()['invalidSamples'],1)

    def test_flat_rear_electrode_reports_contact_instead_of_warming(self):
        e=EEG();t=np.arange(WINDOW)/250
        frame=np.ones((WINDOW,11));frame[:,:8]=np.sin(2*np.pi*10*t)[:,None]*10
        frame[:,6]=0;self.feed_settled_window(e, frame)
        packet=e.snapshot()
        self.assertEqual(packet['ssvepState'],'contact')
        self.assertIn('Oz: flat signal',packet['signalIssues'][0])

    def test_stale_data_is_not_ready(self):
        e=EEG()
        with patch('unicorn.time.monotonic',return_value=10):
            e.push(np.ones((WINDOW,11)))
        with patch('unicorn.time.monotonic',return_value=12):
            self.assertEqual(e.snapshot()['state'],'offline')

    def test_sdk_acquisition_uses_real_mode_and_stops_cleanly(self):
        stop=threading.Event()
        class Device:
            no_of_acquired_channels=11
            max_scans_per_read=25
            stopped=False
            configured=None
            test_signal=None
            def configure(self, **kwargs): self.configured=kwargs
            def start(self, test_signal): self.test_signal=test_signal
            def get_data(self, scans):
                stop.set()
                frame = np.ones((scans,11))
                frame[:,9] = np.arange(scans)
                return frame
            def stop(self): self.stopped=True
        d=Device();e=EEG();acquire(e,d,stop)
        self.assertFalse(d.test_signal)
        self.assertEqual(d.configured,dict(eeg_channels=8,accelerometer=False,gyroscope=False,battery=True,counter=True,validation=True))
        self.assertEqual(e.sequence,5)
        self.assertEqual(e.invalid_samples,0)
        self.assertTrue(d.stopped)
        self.assertEqual(e.snapshot()['state'],'offline')

    def test_sdk_read_failure_stops_and_discards_old_samples(self):
        class Device:
            no_of_acquired_channels=11
            max_scans_per_read=25
            stopped=False
            def configure(self, **kwargs): pass
            def start(self, **kwargs): pass
            def get_data(self, scans): raise RuntimeError('Bluetooth disconnected')
            def stop(self): self.stopped=True
        d=Device();e=EEG()
        with self.assertRaisesRegex(RuntimeError,'Bluetooth disconnected'):
            acquire(e,d)
        self.assertTrue(d.stopped)
        self.assertEqual(e.snapshot()['state'],'offline')

    def test_sdk_wrong_channel_layout_cannot_start(self):
        class Device:
            no_of_acquired_channels=17
            def configure(self, **kwargs): pass
            def start(self, **kwargs): raise AssertionError('Must not start with wrong layout')
        with self.assertRaisesRegex(RuntimeError,'unexpected channel layout'):
            acquire(EEG(),Device())

    def test_sdk_counter_gap_invalidates_event_windows(self):
        stop = threading.Event()
        class Device:
            no_of_acquired_channels = 11
            max_scans_per_read = 25
            calls = 0
            def configure(self, **kwargs): pass
            def start(self, **kwargs): pass
            def stop(self): pass
            def get_data(self, scans):
                self.calls += 1
                frame = np.ones((scans,11))
                frame[:,9] = np.arange(scans) + (0 if self.calls == 1 else 10)
                if self.calls == 2: stop.set()
                return frame
        reader = EEG()
        acquire(reader,Device(),stop)
        self.assertEqual(reader.invalid_samples,5)
        self.assertEqual(len(reader.rows),0)
        self.assertEqual(len(reader.erp_rows),0)

if __name__=='__main__':unittest.main()
