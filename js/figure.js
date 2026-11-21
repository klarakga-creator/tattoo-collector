// Bold flat figure drawing + body-part guessing.
// Figure space: 340 wide x 840 tall, centre line at x = 170.
// Style: one solid black silhouette, organic exaggerated shapes (small head,
// long neck, big hands and feet), with thin background-colour cuts for detail.
(function () {
  'use strict';
  const FIG_W = 340, FIG_H = 840, C = 170;

  const r1 = (v) => Math.round(v * 10) / 10;
  const mir = (p) => [FIG_W - p[0], p[1]];
  const abs = (pts) => pts.map((p) => [C + p[0], p[1]]);

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

  // Right half of the front/back silhouette as offsets from the centre line,
  // head top -> down the arm and big hand -> down the curvy side -> foot -> crotch.
  const HALF = abs([
    [0, 42], [18, 45], [30, 58], [33, 78], [27, 97], [15, 109], [7, 116],
    [7, 126], [8, 140],
    [24, 150], [46, 157], [64, 168], [75, 186],
    [81, 212], [87, 250], [93, 290], [101, 330], [108, 368], [112, 396], [114, 412],
    // thumb
    [124, 419], [139, 427], [149, 437], [151, 446], [143, 451], [129, 448], [121, 450],
    [124, 466], [130, 482],
    // four fingers
    [135, 500], [138, 522], [136, 540], [129, 547], [123, 539], [122, 515], [120, 504],
    [118, 517], [119, 541], [115, 559], [108, 562], [104, 548], [105, 519], [103, 505],
    [102, 519], [100, 541], [95, 553], [89, 551], [88, 534], [91, 512], [90, 503],
    [87, 513], [83, 529], [77, 533], [74, 524], [77, 504], [82, 486],
    [89, 466], [95, 440], [98, 416],
    // inner arm back up to the armpit
    [95, 380], [87, 340], [79, 300], [71, 262], [63, 232], [57, 220],
    // torso side: chest, waist, wide hips
    [53, 238], [55, 272], [47, 304], [39, 330], [38, 348], [48, 378], [60, 416], [65, 454], [65, 492],
    [61, 534], [57, 576],
    [53, 606], [52, 632],
    [58, 668], [57, 708], [49, 748], [44, 770],
    // big foot
    [50, 784], [68, 792], [86, 802], [93, 815], [84, 826], [52, 829], [28, 827], [19, 816], [20, 796],
    [22, 776], [20, 740], [18, 700], [20, 660], [21, 628], [19, 600], [15, 560], [11, 522], [7, 492], [0, 480]
  ]);
  const FULL = HALF.concat(HALF.slice(1, -1).reverse().map(mir));
  const BODY_D = curve(FULL, true);

  // Profile facing right (we see her right side).
  const SIDE = [
    [172, 44], [192, 50], [204, 64], [208, 80], [215, 91], [208, 97], [209, 104], [204, 112], [197, 118], [186, 121],
    [184, 133], [186, 148], [195, 164], [212, 188], [227, 212], [228, 236], [214, 249], [204, 257],
    [206, 290], [214, 330], [216, 362], [210, 390], [214, 422], [216, 470], [209, 520], [201, 570],
    [198, 600], [196, 622], [197, 662], [193, 712], [187, 752], [185, 770],
    [201, 781], [227, 791], [245, 803], [249, 817], [237, 827], [172, 829], [157, 822], [155, 806], [160, 782],
    [158, 760], [151, 730], [147, 690], [151, 650], [157, 620], [157, 590], [151, 550], [143, 512],
    [131, 480], [118, 448], [115, 414], [123, 388], [135, 360], [139, 330], [135, 290], [127, 250], [125, 210], [131, 180],
    [141, 160], [149, 141], [145, 125], [139, 104], [139, 78], [149, 57], [160, 47]
  ];
  const SIDE_D = curve(SIDE, true);
  const ARM = [
    [151, 172], [167, 158], [185, 166], [192, 192], [190, 232], [188, 272], [190, 312], [195, 352], [199, 392], [200, 412],
    [210, 424], [224, 434], [233, 444], [231, 452], [219, 451], [212, 452],
    [215, 474], [213, 500], [206, 516], [196, 520], [186, 511], [181, 490], [180, 460], [183, 432], [183, 412],
    [178, 372], [171, 332], [166, 296], [160, 258], [155, 220], [150, 192]
  ];
  const ARM_D = curve(ARM, true);

  // Thin background-colour cuts (the "negative space" lines).
  const cut = (pts) => '<path class="cut" d="' + curve(pts, false) + '"/>';
  const cutPair = (pts) => cut(pts) + cut(pts.map(mir));
  const dot = (x, y, r) => '<circle class="cut-dot" cx="' + x + '" cy="' + y + '" r="' + r + '"/>';
  const bun = (x, y) => '<circle class="ink" cx="' + x + '" cy="' + y + '" r="17"/>';

  function frontCuts() {
    return [
      cutPair(abs([[6, 262], [16, 276], [32, 278], [44, 266]])),
      dot(C, 352, 3.2)
    ].join('');
  }
  function backCuts() {
    return [
      cut(abs([[0, 168], [0, 260], [0, 330], [0, 400]])),
      cutPair(abs([[12, 214], [30, 226], [40, 250]])),
      cut(abs([[0, 430], [0, 470]])),
      cutPair(abs([[4, 486], [26, 496], [50, 488]])),
      cutPair(abs([[30, 612], [44, 612]]))
    ].join('');
  }

  // SVG for a view, in figure coordinates. Ids let the app hit-test taps.
  function markup(view) {
    if (view === 'front' || view === 'back') {
      return bun(C, 34) + '<path class="ink" id="bodyPath" d="' + BODY_D + '"/>' + (view === 'front' ? frontCuts() : backCuts());
    }
    const s = bun(148, 50) + '<path class="ink" id="bodyPath" d="' + SIDE_D + '"/>' +
      cut([[136, 470], [148, 486]]) +
      '<path class="ink arm" id="armPath" d="' + ARM_D + '"/>';
    return view === 'left' ? '<g transform="translate(' + FIG_W + ' 0) scale(-1 1)">' + s + '</g>' : s;
  }

  // Path data (figure coords) that covers the body in a view: used to clip leader lines.
  function clipPaths(view) {
    if (view === 'front' || view === 'back') return [BODY_D];
    return [SIDE_D, ARM_D];
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
    const x = view === 'left' ? FIG_W - fx : fx;
    const y = fy, dx = x - C, ax = Math.abs(dx);
    let side = '';
    if (view === 'front') side = dx > 3 ? 'Left' : dx < -3 ? 'Right' : '';
    else if (view === 'back') side = dx > 3 ? 'Right' : dx < -3 ? 'Left' : '';
    else side = view === 'left' ? 'Left' : 'Right';
    const P = (n) => (side ? side + ' ' + n.toLowerCase() : n);
    const armPart = (yy) => yy < 210 ? 'Shoulder' : yy < 310 ? 'Upper arm' : yy < 346 ? 'Elbow' : yy < 408 ? 'Forearm' : yy < 426 ? 'Wrist' : 'Hand';
    const legPart = (yy, rear) => yy < 592 ? (rear ? 'Back of thigh' : 'Thigh') : yy < 636 ? (rear ? 'Back of knee' : 'Knee') :
      yy < 764 ? (rear ? 'Calf' : 'Shin') : yy < 786 ? 'Ankle' : (rear ? 'Heel' : 'Foot');
    const back = view === 'back';

    if (y < 118) {
      if (lateral && y > 60 && y < 108 && x < 166) return P('Behind the ear');
      return back ? 'Back of head' : 'Head';
    }
    if (y < 152) {
      if (back) return ax < 12 ? 'Nape' : P('Neck');
      if (lateral) return x < 160 ? P('Nape') : P('Neck');
      return ax < 10 ? 'Throat' : P('Neck');
    }
    if (lateral) {
      if (hit('armPath', x, y)) return P(armPart(y));
      const front = x > 186, rear = x < 152;
      if (y < 200) return front ? P('Collarbone') : rear ? 'Upper back' : P('Shoulder');
      if (y < 262) return front ? P('Chest') : rear ? P('Shoulder blade') : P('Ribs');
      if (y < 330) return rear ? 'Mid back' : P('Ribs');
      if (y < 400) return front ? 'Stomach' : rear ? 'Lower back' : P('Side');
      if (y < 476) return front ? P('Hip') : rear ? P('Glute') : P('Hip');
      return P(legPart(y, x < 172));
    }
    const armThresh = y < 300 ? 59 : y < 360 ? 54 : 70;
    if (y < 206 && ax > 40) return P('Shoulder');
    if (y >= 206 && y < 570 && ax > armThresh) return P(armPart(y));
    if (!back) {
      if (y < 200) return P('Collarbone');
      if (y < 282) return ax < 10 ? 'Sternum' : P('Chest');
      if (y < 330) return ax < 14 ? 'Sternum' : P('Ribs');
      if (y < 392) return ax > 30 ? P('Side') : 'Stomach';
      if (y < 476) return ax > 30 ? P('Hip') : 'Lower stomach';
    } else {
      if (y < 205) return ax < 12 ? 'Spine' : 'Upper back';
      if (y < 285) return ax < 9 ? 'Spine' : P('Shoulder blade');
      if (y < 360) return ax < 9 ? 'Spine' : ax > 30 ? P('Ribs') : 'Mid back';
      if (y < 425) return 'Lower back';
      if (y < 500) return P('Glute');
    }
    return P(legPart(y, back));
  }

  window.Figure = { FIG_W, FIG_H, markup, clipPaths, hit, guessPart };
})();
