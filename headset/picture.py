"""Baseline-corrected, event-locked features for the isolated picture test."""
import numpy as np
from scipy.signal import butter, sosfiltfilt
from ssvep import RATE

PRE = RATE // 5                  # 200 ms before the marker
POST = 4 * RATE // 5             # 800 ms after the marker
LOWPASS = butter(3, 15, fs=RATE, output='sos')
# Run this on the continuous stream, never high-pass individual short epochs.
ERP_BANDPASS = butter(2, [.5, 15], btype='bandpass', fs=RATE, output='sos')


class UnusableCue(ValueError):
    """A valid acquisition window with insufficient usable EEG channels."""


def features(epoch, limit, continuous=None):
    if epoch.shape != (PRE + POST, 8) or not np.isfinite(epoch).all():
        raise ValueError('Incomplete EEG around a picture cue. Repeat this round.')
    filtered = sosfiltfilt(LOWPASS, epoch.astype(float), axis=0)
    filtered -= filtered[:PRE].mean(axis=0)
    span = np.ptp(filtered, axis=0)
    usable = (span >= 1) & (span <= limit) & (np.ptp(epoch, axis=0) >= 1)
    if usable.sum() < 2 or not usable[[2, 4]].any():
        raise UnusableCue(f'Usable channels: {int(usable.sum())}/8; need two, including Cz or Pz. Cz range {span[2]:.0f}, '
                         f'Pz {span[4]:.0f} µV (trial limit {limit:g} µV).')
    response = filtered if continuous is None else np.asarray(continuous, dtype=float).copy()
    if response.shape != epoch.shape or not np.isfinite(response).all():
        raise ValueError('Incomplete filtered EEG around a picture cue.')
    response -= response[:PRE].mean(axis=0)
    # Include early face responses as well as the later P300: 100–700 ms.
    # Stop before the next face onset, which is at least 700 ms away.
    bins = response[PRE+25:PRE+175].reshape(6, 25, 8).mean(axis=1).T
    return [values.tolist() if good else None for values, good in zip(bins, usable)]
