precision highp float;

uniform sampler2D uTexture;
uniform float uHover;
uniform vec2 uMouse;
uniform vec2 uResolution;
uniform vec2 uMeshSize;
uniform float uAlpha;

varying vec2 vUv;

vec2 coverUv(vec2 uv, vec2 textureSize, vec2 meshSize) {
  vec2 s = meshSize / textureSize;
  float scale = max(s.x, s.y);
  vec2 newSize = textureSize * scale;
  vec2 offset = (newSize - meshSize) / newSize * 0.5;
  return uv * meshSize / newSize + offset;
}

void main() {
  vec2 uv = coverUv(vUv, uResolution, uMeshSize);

  // Barrel distortion on hover
  float dist = distance(vUv, uMouse);
  float barrel = smoothstep(0.5, 0.0, dist) * uHover * 0.03;
  vec2 dir = vUv - uMouse;
  uv += dir * barrel;

  vec4 tex = texture2D(uTexture, uv);

  // Brightness boost on hover
  tex.rgb += uHover * 0.08 * smoothstep(0.4, 0.0, dist);

  gl_FragColor = tex;
  gl_FragColor.a *= uAlpha;
}
