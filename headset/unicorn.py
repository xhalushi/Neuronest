"""Live Unicorn acquisition. No generated signal is ever labeled live."""
import threading
import time
from collections import deque
import numpy as np
from scipy.signal import sosfilt, sosfilt_zi
from picture import ERP_BANDPASS
from ssvep import score_filtered, prepare_window, FREQUENCIES, RATE, WINDOW, MAX_SPAN_UV

LABELS = ('Fz', 'C3', 'Cz', 'C4', 'Pz', 'PO7', 'Oz', 'PO8')
SETTLING_SAMPLES = 5 * RATE


class EEG:
    def __init__(self, max_span_uv=MAX_SPAN_UV):
        if not np.isfinite(max_span_uv) or max_span_uv <= 1:
            raise ValueError('The EEG range limit must be finite and greater than 1 µV.')
        self.max_span_uv = max_span_uv
        self.lock = threading.Lock()
        self.rows = deque(maxlen=WINDOW)
        self.erp_rows = deque(maxlen=WINDOW)
        self.erp_state = None
        self.sequence = 0
        self.last = 0
        self.error = 'Live headset not started. Restart with --live to connect.'
        self.battery = None
        self.invalid_samples = 0
        self.settling_left = SETTLING_SAMPLES

    def push(self, data):
        data = np.asarray(data)
        now = time.monotonic()
        with self.lock:
            if now-self.last > .75:
                self.rows.clear()
                self.erp_rows.clear()
                self.erp_state = None
                self.settling_left = SETTLING_SAMPLES
            self.last = now
            self.sequence += len(data)
            # Eight EEG plus battery, counter, validity; no motion channels requested.
            self.battery = float(data[-1, 8])
            # Count acquisition time in samples so polling or a browser refresh
            # cannot shorten the wait. A block may straddle the cutoff.
            for row in data:
                if row[10] != 1 or not np.isfinite(row[:8]).all():
                    self.rows.clear()
                    self.erp_rows.clear()
                    self.erp_state = None
                    self.settling_left = SETTLING_SAMPLES
                    self.invalid_samples += 1
                else:
                    if self.erp_state is None:
                        self.erp_state = sosfilt_zi(ERP_BANDPASS)[:, :, None] * row[:8]
                    filtered, self.erp_state = sosfilt(ERP_BANDPASS, row[None, :8], axis=0, zi=self.erp_state)
                    if self.settling_left:
                        self.settling_left -= 1
                    else:
                        self.rows.append(row[:8].copy())
                        self.erp_rows.append(filtered[0].copy())
            self.error = ''

    def snapshot(self):
        with self.lock:
            age = time.monotonic()-self.last
            data = np.asarray(self.rows)
            sequence = self.sequence
            error = self.error
            invalid_samples = self.invalid_samples
            settling_left = self.settling_left if age < .8 else 0
        powers = {}
        filtered, signal_issues = prepare_window(data, self.max_span_uv) if age < .8 and len(data) == WINDOW else (None, [])
        scores = score_filtered(filtered)
        issues = []
        if age < .8 and len(data) >= 250:
            window = data[-250:]
            taper = np.hanning(250)
            for i, label in enumerate(LABELS):
                values = window[:, i]
                span = np.ptp(values)
                if span < 1 or span > 350:
                    issues.append(label+': check scalp contact')
                    continue
                spectrum = np.abs(np.fft.rfft((values-values.mean())*taper))*2/taper.sum()
                powers[label] = float(10*np.log10(max(float(np.sum(spectrum[8:14]**2)), 1e-12)))
        return dict(state='ready' if powers else 'offline' if age >= .8 else 'warming', sequence=sequence,
                    ssvepState='settling' if settling_left else 'ready' if scores is not None else 'offline' if age >= .8 else 'contact' if signal_issues else 'warming',
                    settlingSeconds=(settling_left + RATE - 1) // RATE,
                    bufferedSamples=len(data), invalidSamples=invalid_samples, signalIssues=signal_issues,
                    scores=scores, frequencies=FREQUENCIES, windowSamples=WINDOW, channels=['PO7','Oz','PO8'],
                    powers=powers, issues=issues, battery=self.battery, error=error, sampleAgeMs=round(min(age,999)*1000), live=True,
                    pictureVersion=2)

    def frequency_ready(self):
        """Cheap watchdog check without recomputing CCA twenty times a second."""
        with self.lock:
            if time.monotonic()-self.last >= .8 or len(self.rows) != WINDOW:
                return False
            filtered, _ = prepare_window(np.asarray(self.rows), self.max_span_uv)
            return filtered is not None

    def picture_marker(self):
        """Estimate the sample at a local visual cue from the latest block end."""
        with self.lock:
            age = time.monotonic() - self.last
            if self.error or age > .20 or len(self.rows) < RATE // 2:
                raise ValueError(self.error or 'Waiting for a steady stream of valid headset samples.')
            return self.sequence + round(age * RATE), self.invalid_samples

    def picture_ready(self):
        """Stream watchdog; per-cue channel checks remain in picture_epoch."""
        with self.lock:
            return not self.error and time.monotonic()-self.last < .25 and len(self.rows) >= RATE // 2

    def picture_epoch(self, marker, invalid):
        from picture import features, PRE, POST
        with self.lock:
            first = self.sequence - len(self.rows)  # sequence is the exclusive end
            start, end = marker - PRE - first, marker + POST - first
            if time.monotonic() - self.last > .25 or invalid != self.invalid_samples or start < 0:
                raise ValueError('EEG was interrupted during a cue. Repeat this round.')
            if end > len(self.rows):
                raise ValueError('EEG arrived late during a cue. Repeat this round.')
            data = np.asarray(self.rows)[start:end]
            continuous = np.asarray(self.erp_rows)[start:end]
        return features(data, self.max_span_uv, continuous)


def acquire(eeg, device, stop_event=None):
    """Read the vendor SDK's configured EEG/status stream on Windows.

    No g.Pype pipeline is involved. Keep sample validity enabled: invalid
    scans must still clear the classifier window in EEG.push().
    """
    device.configure(eeg_channels=8, accelerometer=False, gyroscope=False,
                     battery=True, counter=True, validation=True)
    if device.no_of_acquired_channels != 11:
        raise RuntimeError('Unicorn returned an unexpected channel layout; expected 8 EEG plus battery, counter and validity.')
    # Smaller batches reduce host-side uncertainty in visual event markers.
    scans = min(5, device.max_scans_per_read)
    if scans < 1:
        raise RuntimeError('Unicorn cannot provide a complete scan.')
    device.start(test_signal=False)
    print('Unicorn SDK acquisition started. Keep this server window open.', flush=True)
    try:
        first = True
        previous_counter = None
        while stop_event is None or not stop_event.is_set():
            frame = np.asarray(device.get_data(scans))
            if frame.ndim != 2 or frame.shape != (scans, 11):
                raise RuntimeError('Unicorn returned an incomplete EEG block.')
            counters = frame[:, 9]
            # Reject discontinuities rather than silently shifting event epochs.
            if (not np.isfinite(counters).all() or np.any(np.diff(counters) != 1)
                    or (previous_counter is not None and counters[0] != previous_counter + 1)):
                frame = frame.copy()
                frame[:, 10] = 0
            previous_counter = counters[-1]
            eeg.push(frame)
            if first:
                print('First live EEG samples received.', flush=True)
                first = False
    finally:
        try:
            device.stop()
        finally:
            with eeg.lock:
                eeg.rows.clear()
                eeg.erp_rows.clear()
                eeg.erp_state = None
                eeg.last = 0
                eeg.error = 'Headset acquisition stopped. Restart Start Unicorn.cmd to reconnect.'


def run(eeg, serial=None, stop_event=None):
    """Use the independently distributed g.tec Unicorn SDK directly.

    This app owns its filtering and classification, so it does not need
    g.Pype's pipeline, licensing or attestation modules. Their files and
    Windows application-control settings are left unchanged.
    """
    from gtec_unicorn import Amplifier

    if serial is None:
        devices = Amplifier.get_connected_devices()
        if not devices:
            raise ConnectionError('No paired Unicorn found. Pair and power on the headset in Windows Bluetooth settings.')
        if len(devices) != 1:
            raise ConnectionError('Multiple Unicorns are paired. Start with --serial followed by the headset serial: '+', '.join(map(str, devices)))
        serial = str(devices[0])
    print('Opening Unicorn '+str(serial)+' using the vendor SDK...', flush=True)
    with Amplifier(serial) as device:
        acquire(eeg, device, stop_event)
