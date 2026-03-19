precision highp float;

uniform sampler2D uTexture;
uniform float u_parallax;
uniform float uHover;
uniform vec2 uMouse;
uniform vec2 uResolution;
uniform vec2 uMeshSize;
uniform float uAlpha;
uniform float uTextureReady;

varying vec2 vUv;

#define PARALLAX_AMOUNT 0.1

vec2 coverUv(vec2 uv, vec2 textureSize, vec2 meshSize) {
  vec2 s = meshSize / textureSize;
  float scale = max(s.x, s.y);
  vec2 newSize = textureSize * scale;
  vec2 offset = (newSize - meshSize) / newSize * 0.5;
  return uv * meshSize / newSize + offset;
}

void main() {
  vec2 coords = vUv;
  coords.y += u_parallax * PARALLAX_AMOUNT;

  vec2 uv = coverUv(coords, uResolution, uMeshSize);

  // Barrel distortion on hover — same as grid
  float dist = distance(vUv, uMouse);
  float barrel = smoothstep(0.5, 0.0, dist) * uHover * 0.03;
  vec2 dir = vUv - uMouse;
  uv += dir * barrel;

  vec4 tex = texture2D(uTexture, uv);

  // Brightness boost on hover
  tex.rgb += uHover * 0.08 * smoothstep(0.4, 0.0, dist);

  // Greyscale by default, colour on hover
  float grey = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
  tex.rgb = mix(vec3(grey), tex.rgb, uHover);

  gl_FragColor = tex;
  gl_FragColor.a *= uAlpha * uTextureReady;
}
