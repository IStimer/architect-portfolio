precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float u_distortionAmount;
uniform float uHover;
uniform vec2 uMouse;
uniform float uWind;
uniform vec2 uWindDir;

varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;

  // Radial distortion — center pushes forward, edges stay flat
  float d = distance(uv, vec2(0.5)) / 0.5;
  pos.z -= d * u_distortionAmount;

  // Hover bulge — same as grid
  float hoverDist = distance(uv, uMouse);
  float bulge = smoothstep(0.5, 0.0, hoverDist) * uHover * 0.3;
  pos.z += bulge;

  // Wind — directional bend like a sheet caught in the wind
  float windAxis = dot(uv - 0.5, uWindDir);          // -0.5..0.5 along wind
  float bend = windAxis * uWind * 0.5;                // leading edge lifts
  float ripple = sin(windAxis * 6.28318) * uWind * 0.12; // wave across surface
  pos.z += bend + ripple;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
