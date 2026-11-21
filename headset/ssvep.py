"""CCA frequency matching, independently implemented using harmonic references.

Inspired by frequency-selection examples, not a pretrained model. Scores are
correlations, never probabilities. Live thresholds must be fitted per wearer.
"""
import numpy as np
from scipy.signal import butter, sosfiltfilt

RATE = 250
WINDOW = 750
FREQUENCIES = (5.0, 6.0, 60/7)
CHANNELS = (5, 6, 7)  # Standard Unicorn cap: PO7, Oz, PO8.
REAR_LABELS = ('PO7', 'Oz', 'PO8')
MAX_SPAN_UV = 350
FILTER = butter(3, (3, 32), fs=RATE, btype='bandpass', output='sos')


def basis(matrix):
    u, s, _ = np.linalg.svd(matrix, full_matrices=False)
    return u[:, s > max(float(s[0])*1e-8, 1e-12)]


REFERENCES = []
TIME = np.arange(WINDOW)/RATE
# Fit DC, linear drift and stationary mains together before filtering each
# finite window. Otherwise a large out-of-band tone can ring at its edges.
NUISANCE = basis(np.column_stack([
    np.ones(WINDOW), TIME - TIME.mean(),
    *(fn(2*np.pi*f*TIME) for f in (50, 60) for fn in (np.sin, np.cos)),
]))
for frequency in FREQUENCIES:
    phase = 2*np.pi*frequency*np.arange(WINDOW)/RATE
    reference = np.column_stack([fn(h*phase) for h in (1, 2, 3) for fn in (np.sin, np.cos)])
    REFERENCES.append(basis(reference-reference.mean(axis=0)))


def prepare_window(eeg, max_span_uv=MAX_SPAN_UV):
    eeg = np.asarray(eeg)
    if eeg.shape != (WINDOW, 8) or not np.isfinite(eeg).all():
        return None, [f'Waiting for {WINDOW} fresh, valid EEG samples.']
    rear = eeg[:, CHANNELS].astype(float, copy=False)
    residual = rear - NUISANCE @ (NUISANCE.T @ rear)
    filtered = sosfiltfilt(FILTER, residual, axis=0)
    issues = []
    high = []
    for i, label in enumerate(REAR_LABELS):
        span = np.ptp(filtered[:, i])
        if np.ptp(rear[:, i]) < 1:
            issues.append(label+': flat signal; adjust scalp contact.')
        elif span < 1:
            issues.append(label+': too little EEG signal after filtering. Check electrode contact.')
        elif span > max_span_uv:
            high.append(f'{label} {span:.0f}')
    if high:
        advice = ('Check both L/R sticky pads behind the ears first, then scalp contact at 6–8.'
                  if len(high) == len(CHANNELS) else 'Check scalp contact at the listed electrode(s).')
        issues.append(f'High EEG range ({", ".join(high)} µV peak-to-peak; limit {max_span_uv:g} µV). {advice}')
    return (None if issues else filtered), issues


def score_filtered(filtered):
    if filtered is None:
        return None
    signal_basis = basis(filtered-filtered.mean(axis=0))
    if not signal_basis.shape[1]:
        return None
    return [float(np.clip(np.linalg.svd(signal_basis.T @ ref, compute_uv=False)[0], 0, 1)) for ref in REFERENCES]


def classify(eeg):
    filtered, _ = prepare_window(eeg)
    return score_filtered(filtered)
