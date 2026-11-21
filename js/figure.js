// Anatomical figure drawing + body-part guessing.
// Figure coordinate space: 300 wide x 840 tall, centre line at x = 150.
(function () {
  'use strict';
  const FIG_W = 300, FIG_H = 840;

  const r1 = (v) => Math.round(v * 10) / 10;
  const mir = (p) => [FIG_W - p[0], p[1]];

  // Catmull-Rom spline through points, as cubic Bezier path data.
  function curve(pts, closed) {
    const n = pts.length;
    const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    let d = 'M' + r1(pts[0][0]) + ',' + r1(pts[0][1]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += 'C' + r1(c1[0]) + ',' + r1(c1[1]) + ' ' + r1(c2[0]) + ',' + r1(c2[1]) + ' ' + r1(p2[0]) + ',' + r1(p2[1]);
    }
    return d + (closed ? 'Z' : '');
  }

  // Right half of the front/back silhouette, head top -> crotch.
  const HALF = [
    [150, 16], [168, 20], [181, 32], [187, 50], [188, 72], [186, 94], [181, 112], [174, 124], [167, 134],
    [166, 148], [168, 162],
    [176, 168], [196, 175], [214, 182],
    [226, 192], [233, 208], [235, 228],
    [236, 252], [238, 278], [241, 304],
    [244, 328],
    [248, 354], [252, 382], [255, 408], [256, 428],
    [262, 442], [267, 462], [268, 484], [263, 502], [255, 510], [248, 504], [245, 488], [242, 468], [240, 450],
    [238, 432], [233, 404], [227, 374], [222, 346],
    [219, 326], [216, 300], [212, 272], [208, 250], [203, 236],
    [199, 248], [198, 272], [195, 298], [190, 322], [187, 342],
    [190, 362], [198, 386], [206, 412], [210, 438],
    [211, 468], [208, 504], [203, 540], [198, 568],
    [195, 592], [194, 612],
    [197, 640], [198, 672], [193, 706], [186, 740], [182, 764],
    [184, 784], [191, 800], [197, 812], [192, 822], [174, 824], [163, 818], [162, 800],
    [163, 780], [163, 756], [161, 720], [160, 686], [162, 650], [163, 620],
    [162, 592], [160, 562], [158, 530], [156, 496], [154, 470], [150, 458]
  ];
  const FULL = HALF.concat(HALF.slice(1, -1).reverse().map(mir));
  const BODY_D = curve(FULL, true);

  // Profile silhouette facing right (we see her right side).
  const SIDE = [
    [150, 16], [166, 20], [178, 30], [185, 46], [187, 64], [189, 74], [195, 86], [190, 92], [191, 100], [188, 106],
    [189, 112], [184, 118], [183, 126], [176, 132], [166, 134],
    [164, 146], [166, 162], [172, 178], [178, 198], [186, 218], [194, 240], [193, 256], [184, 268], [175, 276],
    [174, 300], [176, 330], [181, 360], [184, 384], [180, 410], [176, 436], [178, 472], [175, 510], [171, 548],
    [170, 578], [171, 600], [168, 620],
    [166, 654], [164, 700], [160, 744], [158, 768], [164, 784], [184, 798], [200, 810], [198, 820], [150, 822],
    [134, 820], [130, 806], [132, 786], [134, 768],
    [137, 736], [141, 700], [145, 664], [143, 630], [137, 602], [136, 572], [135, 536], [132, 500], [128, 470],
    [122, 448], [118, 424], [120, 400], [127, 376], [131, 350], [129, 318], [124, 286], [121, 250], [123, 214],
    [127, 190], [133, 170], [136, 152],
    [132, 136], [124, 122], [118, 100], [116, 76], [120, 52], [130, 32], [140, 21]
  ];
  // Widen the profile to realistic body depth (head a little less than torso).
  const sxAt = (y) => (y < 130 ? 1.22 : y < 170 ? 1.22 + (0.23 * (y - 130)) / 40 : 1.45);
  const widen = (p) => [150 + (p[0] - 150) * sxAt(p[1]), p[1]];
  const narrowX = (x, y) => 150 + (x - 150) / sxAt(y);
  const SIDE_D = curve(SIDE.map(widen), true);
  const ARM = [
    [136, 186], [150, 178], [166, 186], [171, 206], [170, 236], [168, 268], [166, 300], [165, 330], [166, 360],
    [167, 392], [166, 420], [166, 440], [170, 456], [171, 478], [166, 498], [156, 506], [146, 500], [143, 484],
    [144, 462], [146, 442], [142, 420], [140, 392], [138, 362], [137, 332], [134, 300], [131, 266], [129, 232],
    [130, 206]
  ];
  const ARM_D = curve(ARM.map((p) => [150 + (p[0] - 150) * 1.3, p[1]]), true);

  const line = (pts, cls) => '<path class="' + (cls || 'd') + '" d="' + curve(pts, false) + '"/>';
  const pair = (pts, cls) => line(pts, cls) + line(pts.map(mir), cls);
  const ell = (cx, cy, rx, ry, cls) =>
    '<ellipse class="' + (cls || 'd') + '" cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '"/>';
  const ellPair = (cx, cy, rx, ry, cls) => ell(cx, cy, rx, ry, cls) + ell(FIG_W - cx, cy, rx, ry, cls);

  const EAR = [[186, 70], [191, 76], [191, 90], [186, 96]];

  function frontDetails() {
    return [
      pair([[156, 170], [172, 168], [192, 173], [214, 181]]),
      pair([[163, 130], [160, 150], [154, 166]], 'd faint'),
      line([[144, 173], [150, 177], [156, 173]]),
      pair([[158, 262], [166, 276], [182, 280], [196, 270], [200, 252]]),
      pair([[214, 188], [221, 210], [224, 234]], 'd faint'),
      pair([[193, 368], [184, 396], [168, 424]]),
      pair([[202, 452], [193, 500], [184, 546], [180, 572]], 'd faint'),
      ellPair(178, 602, 9, 12, 'd faint'),
      pair([[176, 632], [175, 690], [172, 742]], 'd faint'),
      pair([[225, 328], [233, 331]]),
      pair(EAR),
      line([[150, 290], [150, 336]], 'd faint'),
      ell(150, 352, 2.5, 4)
    ].join('');
  }

  function backDetails() {
    return [
      line([[150, 150], [150, 420]], 'd spine'),
      pair([[160, 206], [178, 200], [194, 210], [194, 236], [176, 262], [162, 258]]),
      pair([[160, 140], [170, 162], [200, 176]], 'd faint'),
      ellPair(141, 412, 2.5, 2.5),
      line([[150, 428], [150, 466]]),
      pair([[154, 474], [172, 482], [194, 474]]),
      pair([[170, 598], [186, 597]]),
      pair([[192, 640], [186, 690]], 'd faint'),
      pair([[166, 640], [168, 690]], 'd faint'),
      pair([[238, 326], [242, 334]]),
      pair([[188, 72], [190, 84], [187, 94]])
    ].join('');
  }

  const W = (pts) => pts.map(widen);
  const WA = (pts) => pts.map((p) => [150 + (p[0] - 150) * 1.3, p[1]]);
  function sideDetails() {
    return [
      ell(r1(widen([140, 82])[0]), 82, 7, 12),
      line(W([[178, 350], [176, 356]])),
      line(W([[124, 462], [136, 470]])),
      line(W([[167, 598], [163, 610]]), 'd faint'),
      ell(r1(widen([147, 772])[0]), 772, 3, 3, 'd faint'),
      line(W([[124, 215], [128, 245]]), 'd faint')
    ].join('');
  }
  function armDetails() {
    return [
      line(WA([[136, 222], [150, 236], [168, 228]]), 'd faint'),
      line(WA([[164, 330], [158, 334]]))
    ].join('');
  }

  // Returns SVG markup in figure coordinates. Ids let the app hit-test taps.
  function markup(view) {
    if (view === 'front' || view === 'back') {
      return (
        '<clipPath id="clipBody"><path d="' + BODY_D + '"/></clipPath>' +
        '<path class="body" id="bodyPath" d="' + BODY_D + '"/>' +
        '<path class="rim" clip-path="url(#clipBody)" d="' + BODY_D + '"/>' +
        '<path class="outline" d="' + BODY_D + '"/>' +
        (view === 'front' ? frontDetails() : backDetails())
      );
    }
    const s =
      '<clipPath id="clipBody"><path d="' + SIDE_D + '"/></clipPath>' +
      '<clipPath id="clipArm"><path d="' + ARM_D + '"/></clipPath>' +
      '<path class="body" id="bodyPath" d="' + SIDE_D + '"/>' +
      '<path class="rim" clip-path="url(#clipBody)" d="' + SIDE_D + '"/>' +
      '<path class="outline" d="' + SIDE_D + '"/>' +
      sideDetails() +
      '<path class="body" id="armPath" d="' + ARM_D + '"/>' +
      '<path class="rim" clip-path="url(#clipArm)" d="' + ARM_D + '"/>' +
      '<path class="outline" d="' + ARM_D + '"/>' +
      armDetails();
    return view === 'left' ? '<g transform="translate(300 0) scale(-1 1)">' + s + '</g>' : s;
  }

  // Hit-test a point (figure coords, un-mirrored) against a path by id.
  function hit(id, x, y) {
    const el = document.getElementById(id);
    if (!el || typeof el.isPointInFill !== 'function') return null;
    try { return el.isPointInFill(new DOMPoint(x, y)); } catch (e) { /* older Safari */ }
    try {
      const svg = el.ownerSVGElement; const p = svg.createSVGPoint(); p.x = x; p.y = y;
      return el.isPointInFill(p);
    } catch (e) { return null; }
  }

  // Best guess of a body-part name for a tap at figure coords (fx, fy) in a view.
  function guessPart(view, fx, fy) {
    const lateral = view === 'left' || view === 'right';
    let x = view === 'left' ? FIG_W - fx : fx;
    const y = fy, dx = x - 150, ax = Math.abs(dx);
    let side = '';
    if (view === 'front') side = dx > 3 ? 'Left' : dx < -3 ? 'Right' : '';
    else if (view === 'back') side = dx > 3 ? 'Right' : dx < -3 ? 'Left' : '';
    else side = view === 'left' ? 'Left' : 'Right';
    const P = (n) => (side ? side + ' ' + n.toLowerCase() : n);
    const armPart = (yy) => yy < 232 ? 'Shoulder' : yy < 316 ? 'Upper arm' : yy < 342 ? 'Elbow' : yy < 424 ? 'Forearm' : yy < 442 ? 'Wrist' : 'Hand';
    const legPart = (yy, rear) => yy < 580 ? (rear ? 'Back of thigh' : 'Thigh') : yy < 622 ? (rear ? 'Back of knee' : 'Knee') :
      yy < 762 ? (rear ? 'Calf' : 'Shin') : yy < 790 ? 'Ankle' : (rear ? 'Heel' : 'Foot');
    const back = view === 'back';

    if (y < 136) {
      if (lateral && y > 56 && y < 112 && narrowX(x, y) > 124 && narrowX(x, y) < 150) return P('Behind the ear');
      return back ? 'Back of head' : 'Head';
    }
    if (y < 172) {
      if (back || (lateral && narrowX(x, y) < 142)) return ax < 14 && !lateral ? 'Nape' : P('Neck');
      return ax < 12 && !lateral ? 'Throat' : P('Neck');
    }
    if (lateral) {
      if (hit('armPath', x, y)) return P(armPart(y));
      x = narrowX(x, y);
      const front = x > 158, rear = x < 138;
      if (y < 215) return front ? P('Collarbone') : rear ? 'Upper back' : P('Shoulder');
      if (y < 280) return front ? P('Chest') : rear ? P('Shoulder blade') : P('Ribs');
      if (y < 330) return rear ? 'Mid back' : P('Ribs');
      if (y < 400) return front ? 'Stomach' : rear ? 'Lower back' : P('Side');
      if (y < 450) return front ? P('Hip') : rear ? P('Glute') : P('Hip');
      if (y < 480 && x < 136) return P('Glute');
      return P(legPart(y, x < 146));
    }
    const armThresh = y < 300 ? 55 : y < 360 ? 47 : y < 450 ? 63 : 66;
    if (y < 236 && ax > 44) return P('Shoulder');
    if (y >= 236 && y < 520 && ax > armThresh) return P(armPart(y));
    if (!back) {
      if (y < 218) return P('Collarbone');
      if (y < 282) return ax < 13 ? 'Sternum' : P('Chest');
      if (y < 330) return ax < 16 ? 'Sternum' : P('Ribs');
      if (y < 392) return ax > 34 ? P('Side') : 'Stomach';
      if (y < 455) return ax > 30 ? P('Hip') : 'Lower stomach';
    } else {
      if (y < 218) return ax < 12 ? 'Spine' : 'Upper back';
      if (y < 290) return ax < 10 ? 'Spine' : P('Shoulder blade');
      if (y < 360) return ax < 10 ? 'Spine' : ax > 34 ? P('Ribs') : 'Mid back';
      if (y < 425) return 'Lower back';
      if (y < 478) return P('Glute');
    }
    return P(legPart(y, back));
  }

  window.Figure = { FIG_W, FIG_H, markup, hit, guessPart };
})();
