precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float u_distortionAmount;

varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;

  // Concave bulge — center pushes forward, edges stay
  float d = 1.0 - distance(uv, vec2(0.5)) / 0.5;
  pos.z = d * u_distortionAmount;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
