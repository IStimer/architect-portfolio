precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uHover;
uniform vec2 uMouse;

varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;

  // Hover bulge — push vertices toward camera
  float dist = distance(uv, uMouse);
  float bulge = smoothstep(0.5, 0.0, dist) * uHover * 0.3;
  pos.z += bulge;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
