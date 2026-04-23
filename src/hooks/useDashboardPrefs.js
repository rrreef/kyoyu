import { useState } from 'react';

const KEY = 'reef_dashboard_prefs';

export const DASHBOARD_DEFAULTS = {
  layout:         'standard',
  defaultTab:     'Overview',
  defaultPeriod:  'Week',
  chartStyle:     'line',
  chartMetric:    'Streams',
  accentColor:    'orange',
  metricColors: {
    streams:   'orange',
    downloads: 'blue',
    vinyl:     'violet',
    revenue:   'emerald',
  },
  showKpis:       true,
  showChart:      true,
  showTopTracks:  true,
  showPayout:     true,
  autoRefresh:    'off',
  animateCharts:  true,
};

export function useDashboardPrefs() {
  const [prefs, setPrefs] = useState(() => {
    try {
      const parsed = localStorage.getItem(KEY) ? JSON.parse(localStorage.getItem(KEY)) : {};
      return {
        ...DASHBOARD_DEFAULTS,
        ...parsed,
        // deep-merge metricColors so individual keys survive partial saves
        metricColors: { ...DASHBOARD_DEFAULTS.metricColors, ...(parsed.metricColors || {}) },
      };
    } catch { return { ...DASHBOARD_DEFAULTS }; }
  });

  function updatePref(key, value) {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function resetPrefs() {
    setPrefs({ ...DASHBOARD_DEFAULTS });
    try { localStorage.removeItem(KEY); } catch {}
  }

  return { prefs, updatePref, resetPrefs };
}
