precision highp float;

uniform sampler2D u_scene;

varying vec2 vUv;

void main() {
  gl_FragColor = texture2D(u_scene, vUv);
}
