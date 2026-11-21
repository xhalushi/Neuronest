import unittest
import numpy as np
from ssvep import classify,prepare_window,FREQUENCIES,WINDOW,RATE
from simulation import Home

class FrequencyTests(unittest.TestCase):
    def test_each_frequency_and_random_phase(self):
        rng=np.random.default_rng(3)
        for index,f in enumerate(FREQUENCIES):
            eeg=rng.normal(0,2,(WINDOW,8))
            t=np.arange(WINDOW)/RATE
            for c in (5,6,7):
                eeg[:,c]+=8*np.sin(2*np.pi*f*t+rng.uniform(0,6))
            scores=classify(eeg)
            self.assertEqual(int(np.argmax(scores)),index)
            self.assertGreater(scores[index],.75)

    def test_invalid_flat_and_artifacts_rejected(self):
        self.assertIsNone(classify(np.zeros((WINDOW,8))))
        self.assertIsNone(classify(np.ones((100,8))))
        broken=np.random.default_rng(1).normal(0,2,(WINDOW,8));broken[0,6]=np.nan
        self.assertIsNone(classify(broken))

    def test_noise_does_not_look_like_a_strong_target(self):
        eeg=np.random.default_rng(25).normal(0,3,(WINDOW,8))
        self.assertLess(max(classify(eeg)),.55)

    def test_slow_offset_drift_is_filtered_before_amplitude_check(self):
        rng=np.random.default_rng(5)
        t=np.arange(WINDOW)/RATE
        eeg=rng.normal(0,2,(WINDOW,8))
        for c in (5,6,7):
            eeg[:,c]+=np.linspace(0,900,WINDOW)+10*np.sin(2*np.pi*FREQUENCIES[2]*t)
        self.assertGreater(np.ptp(eeg[:,6]),350)
        scores=classify(eeg)
        self.assertIsNotNone(scores)
        self.assertEqual(int(np.argmax(scores)),2)

    def test_three_slots_have_separate_reference_harmonics(self):
        self.assertEqual(len(FREQUENCIES), 3)
        harmonics = [{round(f * h, 5) for h in (1, 2, 3)} for f in FREQUENCIES]
        for i, refs in enumerate(harmonics):
            for other in harmonics[i+1:]:
                self.assertTrue(refs.isdisjoint(other))

    def test_stationary_mains_with_target_and_without_eeg(self):
        t = np.arange(WINDOW)/RATE
        for hum in (50, 60):
            for slot, hz in enumerate(FREQUENCIES):
                with self.subTest(hum=hum, target=hz):
                    interference = 1200*np.sin(2*np.pi*hum*t + 1.4)
                    eeg = np.tile(interference[:, None], (1, 8))
                    self.assertIsNone(classify(eeg))
                    eeg += 10*np.sin(2*np.pi*hz*t)[:, None]
                    scores = classify(eeg)
                    self.assertIsNotNone(scores)
                    self.assertEqual(np.argmax(scores), slot)

    def test_large_in_band_signals_still_block_with_specific_guidance(self):
        t = np.arange(WINDOW)/RATE
        eeg = np.tile((8*np.sin(2*np.pi*6*t))[:, None], (1, 8))
        for channel in (5, 6, 7):
            eeg[:, channel] *= 100
            filtered, issues = prepare_window(eeg)
            self.assertIsNone(filtered)
            self.assertIn('High EEG range', issues[0])
            self.assertEqual('L/R' in issues[0], channel == 7)

class SimplifiedHomeTests(unittest.TestCase):
    def setUp(self):
        self.home=Home();self.packet=dict(mode='ssvep',session='frequency-session',screen=1,ready=True)
        self.home.session_update(self.packet)

    def perform(self,action,confirmed=True):
        p=self.home.prepare({**self.packet,'action':action})
        self.assertTrue(p['requiresConfirmation'])
        return self.home.commit({**self.packet,'id':p['id'],'confirmed':confirmed})

    def test_every_setting_requires_confirmation(self):
        for action in [dict(kind='set',target='bedroom.light',value=0),dict(kind='set',target='climate',value=73),dict(kind='set',target='door',value=0)]:
            with self.assertRaises(ValueError):self.perform(action,False)

    def test_security_on_off_and_no_dimming(self):
        self.perform(dict(kind='set',target='door',value=0))
        self.assertEqual(self.home.devices['door']['value'],0)
        self.perform(dict(kind='set',target='door',value=1))
        self.assertEqual(self.home.devices['door']['value'],1)
        with self.assertRaises(ValueError):self.perform(dict(kind='set',target='bedroom.light',value=25))

    def test_presets_leave_security_and_bed_unchanged(self):
        for preset,light,temp in [('sleep',0,72),('morning',100,74)]:
            self.perform(dict(kind='routine',name=preset))
            self.assertEqual(self.home.devices['bedroom.light']['value'],light)
            self.assertEqual(self.home.devices['climate']['target'],temp)
            self.assertEqual(self.home.devices['door']['value'],1)
            self.assertFalse(self.home.devices['bed']['moving'])

    def test_emergency_category_is_simulated(self):
        self.perform(dict(kind='help',category='Emergency'))
        self.assertEqual(self.home.requests[0]['category'],'Emergency')

if __name__=='__main__':unittest.main()
