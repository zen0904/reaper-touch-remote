const FAMILY_RULES = [
  { family: "analyzer", label: "ANA", accent: "#6ed7ff", pattern: /analy[sz]er|spectrum|spectro|meter|loudness|correlation|oscilloscope|rta/ },
  { family: "equalizer", label: "EQ", accent: "#48cceb", pattern: /equalizer|\beq\b|frequency|\bfreq\b|cutoff|resonan|high.?pass|low.?pass|shelf|\bq\b/ },
  { family: "dynamics", label: "DYN", accent: "#67dc91", pattern: /compress|limiter|gate|expan|threshold|ratio|knee|de.?ess|peak reduction|gain reduction/ },
  { family: "delay", label: "DLY", accent: "#efba55", pattern: /delay|echo|feedback|tap tempo|division|ping.?pong/ },
  { family: "space", label: "RVB", accent: "#aa90f2", pattern: /reverb|room|hall|plate|chamber|decay|damping|diffusion|early reflection|pre.?delay/ },
  { family: "modulation", label: "MOD", accent: "#65aaff", pattern: /chorus|flang|phaser|modulat|\blfo\b|tremolo|vibrato|depth|rate/ },
  { family: "pitch", label: "PCH", accent: "#e97bbb", pattern: /pitch|formant|transpose|detune|semitone|\bcents?\b|tune/ },
  { family: "tone", label: "SAT", accent: "#ee8366", pattern: /saturat|distort|overdrive|harmonic|amp|cabinet|exciter|drive|warm|color/ },
  { family: "imaging", label: "IMG", accent: "#59d5c2", pattern: /stereo|width|image|mid.?side|correlation|pan|balance|mono/ },
  { family: "instrument", label: "INST", accent: "#65d2b8", pattern: /synth|sampler|instrument|oscillator|envelope|\bosc\b|filter envelope|velocity/ },
  { family: "utility", label: "UTIL", accent: "#a7bac4", pattern: /utility|trim|gain|phase|polarity|routing|channel|input|output|mix|wet|dry/ }
];

const SPECIFIC_PROFILES = [
  { id: "waves-f6", renderer: "direct-eq", family: "equalizer", label: "F6", accent: "#d7df5b", matches: (name) => /\bF6(?:-RTA)?\b/i.test(name) },
  { id: "waves-cla-2a", renderer: "optical-compressor", family: "dynamics", label: "OPTO", accent: "#d6ad5e", matches: (name) => /\bCLA[\s-]*2A\b/i.test(name) }
];

function parameterText(parameters) {
  return parameters.map((parameter) => parameter.name || "").join(" ");
}

export function pluginProfile(name = "", parameters = []) {
  const specific = SPECIFIC_PROFILES.find((profile) => profile.matches(name, parameters));
  if (specific) return specific;

  const params = parameterText(parameters);
  const hasDirectBands = /\bBand\s*\d+\s*(?:Freq|Frequency)\b/i.test(params)
    && /\bBand\s*\d+\s*Gain\b/i.test(params);
  if (hasDirectBands) return { id: "semantic-eq", renderer: "direct-eq", family: "equalizer", label: "EQ", accent: "#48cceb" };

  const nameText = name.toLowerCase();
  const parameterNames = parameters.map((parameter) => String(parameter.name || "").toLowerCase());
  const ranked = FAMILY_RULES.map((rule, order) => ({
    ...rule,
    order,
    score: (rule.pattern.test(nameText) ? 4 : 0) + parameterNames.reduce((score, item) => score + (rule.pattern.test(item) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score || a.order - b.order);

  const eq = ranked.find((item) => item.family === "equalizer")?.score || 0;
  const dynamics = ranked.find((item) => item.family === "dynamics")?.score || 0;
  const tone = ranked.find((item) => item.family === "tone")?.score || 0;
  if (eq >= 2 && dynamics >= 2 && (tone >= 1 || parameters.length >= 18)) {
    return { id: "semantic-channel-strip", renderer: "adaptive-family", family: "channel-strip", label: "STRIP", accent: "#4fd0d3" };
  }

  const winner = ranked[0];
  if (winner?.score > 0) return { id: `semantic-${winner.family}`, renderer: "adaptive-family", family: winner.family, label: winner.label, accent: winner.accent };
  return { id: "semantic-processor", renderer: "adaptive-family", family: "processor", label: "FX", accent: "#2bc9f6" };
}

export function profileParameter(parameters = [], name) {
  const wanted = String(name).replace(/[\s/_-]+/g, "").toLowerCase();
  return parameters.find((parameter) => String(parameter.name || "").replace(/[\s/_-]+/g, "").toLowerCase() === wanted);
}
