const PRESENTATIONS = [
  { kind: "space", label: "RVB", accent: "#a98cff", pattern: /reverb|room|hall|plate|chamber|decay|damping|diffusion|early reflection/ },
  { kind: "delay", label: "DLY", accent: "#f2b84b", pattern: /delay|echo|feedback|tap tempo/ },
  { kind: "dynamics", label: "DYN", accent: "#57d98b", pattern: /compress|limiter|gate|expander|threshold|ratio|knee|de.?ess/ },
  { kind: "equalizer", label: "EQ", accent: "#35c9f4", pattern: /equalizer|\beq\b|frequency|\bfreq\b|cutoff|resonance|high.?pass|low.?pass|\bq\b/ },
  { kind: "modulation", label: "MOD", accent: "#56a8ff", pattern: /chorus|flanger|phaser|modulat|\blfo\b|tremolo|vibrato/ },
  { kind: "pitch", label: "PCH", accent: "#ef78bd", pattern: /pitch|formant|transpose|detune|semitone|\bcents?\b/ },
  { kind: "tone", label: "SAT", accent: "#ff8768", pattern: /saturat|distort|overdrive|harmonic|amp sim|exciter/ },
  { kind: "instrument", label: "INST", accent: "#66d8c7", pattern: /synth|sampler|instrument|oscillator|envelope|\bosc\b/ }
];

export function pluginPresentation(name = "", parameters = []) {
  const haystack = `${name} ${parameters.map((param) => param.name || "").join(" ")}`.toLowerCase();
  return PRESENTATIONS.find((item) => item.pattern.test(haystack)) || { kind: "processor", label: "FX", accent: "#2bc9f6" };
}
