/* ===== Nenyoo — clean URLs =====
   GitHub Pages serves /guides from guides.html, but a visitor who lands on a
   ".html" link would see it in the address bar. Strip it (and map index -> /)
   without reloading. Runs on every page since app.js is included everywhere. */
(function(){
  try {
    var p = location.pathname, clean = p;
    if(/\/index\.html$/i.test(p)) clean = p.replace(/\/index\.html$/i, '/');
    else if(/\.html$/i.test(p)) clean = p.replace(/\.html$/i, '');
    if(clean !== p) history.replaceState(null, '', clean + location.search + location.hash);
  } catch(e){}
})();

/* ===== Nenyoo — shared background FX + draggable cat easter egg =====
   Ported from the original DataCore component to plain vanilla JS so it can
   run on every standalone page. Looks for <canvas id="fx"> and <canvas id="catFx">. */
(function(){
  var fxCanvas = document.getElementById('fx');
  if(!fxCanvas) return;
  var catCanvas = document.getElementById('catFx');
  var ctx = fxCanvas.getContext('2d');
  var catCtx = catCanvas ? catCanvas.getContext('2d') : null;

  var app = {
    mouse: { x: -9999, y: -9999 },
    drag: false,
    grabR: 36,
    dpr: 1,
    cat: null,
    raf: 0,
    grabCount: 0,
    rageUntil: 0,
    rageText: '',
    protests: [
      'please leave me i need to ruin lobbies',
      'put me down i got games to win',
      'nooo i was about to boom someone',
      'unhand me mortal',
      'this is hwid harassment fr',
      '5 more lobbies then i sleep i promise',
      'i was winning ranked let me gooo',
      'help nenyoo im being kidnapped',
    ],
    rageLines: [
      'YOU SHOULD HAVE LEFT ME ALONE',
      'ENOUGH. WITNESS TRUE POWER',
      'THE LOBBIES WILL BURN',
      'NENYOO GRANTS ME FORBIDDEN POWER',
    ],
    phrases: [
      'i love nenyoo',
      'yesterday i was trolling with nenyoo and i boomed a guy',
      'nenyoo got me undetected fr',
      'MVP is so worth it ngl',
      'just reset my hwid, ez',
      'antivirus off, loader on, lets go',
      'meow = gg',
      'who needs skill when u got nenyoo',
      'i carried my whole lobby today',
      'purr... see u in ranked',
    ],
  };

  app.onResize = function(){
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    app.dpr = dpr;
    var w = window.innerWidth * dpr, h = window.innerHeight * dpr;
    [fxCanvas, catCanvas].forEach(function(c){ if(c){ c.width = w; c.height = h; } });
  };

  app.onMouse = function(e){
    app.mouse.x = e.clientX; app.mouse.y = e.clientY;
    var cat = app.cat; if(!cat) return;
    if(app.drag){
      cat.x = Math.max(20, Math.min(window.innerWidth - 20, e.clientX));
      cat.y = Math.max(20, Math.min(window.innerHeight - 20, e.clientY));
    } else {
      var near = Math.hypot(e.clientX - cat.x, e.clientY - cat.y) < app.grabR;
      document.body.style.cursor = near ? 'grab' : '';
    }
  };

  app.onDown = function(e){
    var cat = app.cat; if(!cat) return;
    if(Math.hypot(e.clientX - cat.x, e.clientY - cat.y) < app.grabR){
      app.drag = true; cat.held = true;
      cat.say = app.protests[(Math.random()*app.protests.length)|0];
      cat.pause = 0;
      document.body.style.cursor = 'grabbing';
      // easter egg: grab the cat 5 times -> RAGE MODE
      var tnow = performance.now();
      if(tnow > app.rageUntil){
        app.grabCount++;
        if(app.grabCount >= 5){
          app.rageUntil = tnow + 7000;
          app.rageText = app.rageLines[(Math.random()*app.rageLines.length)|0];
          app.grabCount = 0;
        }
      }
    }
  };

  app.onUp = function(){
    if(!app.drag) return;
    app.drag = false;
    if(app.cat){ app.cat.held = false; app.cat.say = null; app.cat.tx = app.cat.x; app.cat.ty = app.cat.y; }
    document.body.style.cursor = '';
  };

  app.updateCat = function(cat, W, H){
    if(app.drag){ cat.phase += 0.32; return; }   // held by the mouse — wiggle, stay put
    var m = 90;
    if(cat.pause > 0){ cat.pause--; cat.phase += 0.04; return; }
    var dx = cat.tx - cat.x, dy = cat.ty - cat.y;
    var d = Math.hypot(dx, dy);
    if(d < 26){
      cat.tx = m + Math.random()*(W - 2*m);
      cat.ty = m + Math.random()*(H - 2*m);
      if(Math.random() < 0.55){
        cat.pause = 200 + Math.random()*160;          // ~3-6s sit
        cat.say = app.phrases[(Math.random()*app.phrases.length)|0];
        cat.sayMax = cat.pause;
      }
      return;
    }
    var sp = 1.15;
    cat.x += (dx/d) * sp;
    cat.y += (dy/d) * sp;
    if(Math.abs(dx) > 1.5) cat.facing = dx < 0 ? -1 : 1;
    cat.phase += 0.22;
  };

  app.drawCat = function(ctx, cat, time, rage){
    rage = rage || 0;
    var walk = (cat.pause > 0 || cat.held) ? 0 : Math.sin(cat.phase);
    var tail = Math.sin(time*0.005);
    ctx.save();
    var bob = rage > 0 ? Math.abs(Math.sin(time*0.004)) * 7 * rage : 0;
    var grow = 1 + rage*0.75 + (rage > 0 ? Math.sin(time*0.006)*0.06*rage : 0);
    ctx.translate(cat.x, cat.y - bob);
    ctx.scale(cat.facing * grow, grow);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = rage > 0.3 ? 'rgba(255,40,40,0.85)' : 'rgba(167,139,250,0.85)';
    ctx.shadowBlur = 15;
    var body = '#efe7fb', line = '#b9a4f5', stripe = '#d8cbf2';
    var pink = '#f3a6c8', pinkDeep = '#ef84b4';
    var swing = walk * 2.6;

    // ---- fluffy curled tail (behind) ----
    ctx.strokeStyle = line; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-12, 4);
    ctx.quadraticCurveTo(-27, 2 + tail*5, -25, -13 + tail*7);
    ctx.quadraticCurveTo(-24, -21 + tail*7, -18, -20 + tail*6);
    ctx.stroke();
    ctx.strokeStyle = stripe; ctx.lineWidth = 5;            // lighter tip
    ctx.beginPath();
    ctx.moveTo(-20, -18 + tail*6.5);
    ctx.quadraticCurveTo(-23, -21 + tail*7, -18, -20 + tail*6);
    ctx.stroke();

    // ---- hind paws ----
    ctx.fillStyle = body; ctx.strokeStyle = line; ctx.lineWidth = 2;
    [[-6, swing],[3, -swing]].forEach(function(p){
      ctx.beginPath(); ctx.ellipse(p[0] + p[1], 12.5, 3.4, 2.5, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    });

    // ---- body with soft fur shading ----
    var bg = ctx.createLinearGradient(0, -8, 0, 13);
    bg.addColorStop(0, '#f7f2ff'); bg.addColorStop(1, '#e2d6f6');
    ctx.fillStyle = bg; ctx.strokeStyle = line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(-1, 2, 15, 10, -0.05, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = stripe; ctx.lineWidth = 2;            // tabby back stripes
    [-6,-1,4].forEach(function(sx){ ctx.beginPath(); ctx.moveTo(sx,-7); ctx.quadraticCurveTo(sx-3,-2,sx,4); ctx.stroke(); });

    // ---- front paws ----
    ctx.strokeStyle = line; ctx.fillStyle = body;
    [[8, -swing],[13, swing]].forEach(function(p){
      var lx = p[0], s = p[1];
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx, 6); ctx.lineTo(lx + s, 12); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(lx + s, 13, 3.2, 2.4, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    });

    // ---- head ----
    var hx = 13, hy = -7, hr = 11;
    var hg = ctx.createRadialGradient(hx-3, hy-4, 2, hx, hy, hr+2);
    hg.addColorStop(0, '#fcf9ff'); hg.addColorStop(1, '#ebe2fa');
    ctx.fillStyle = hg; ctx.strokeStyle = line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    // ---- rounded ears with pink inner ----
    ctx.fillStyle = body; ctx.strokeStyle = line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hx-8, hy-6); ctx.quadraticCurveTo(hx-12, hy-17, hx-3, hy-9.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx+3, hy-9.5); ctx.quadraticCurveTo(hx+12, hy-17, hx+8, hy-6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = pink;
    ctx.beginPath(); ctx.moveTo(hx-7, hy-6.5); ctx.quadraticCurveTo(hx-9.5, hy-13, hx-4.5, hy-9); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx+4.5, hy-9); ctx.quadraticCurveTo(hx+9.5, hy-13, hx+7, hy-6.5); ctx.closePath(); ctx.fill();

    // forehead stripes
    ctx.strokeStyle = stripe; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx-2,hy-9.5); ctx.lineTo(hx-2.5,hy-5.5);
    ctx.moveTo(hx+1,hy-9.8); ctx.lineTo(hx+1,hy-5.5);
    ctx.moveTo(hx+4,hy-9.5); ctx.lineTo(hx+4.5,hy-5.5);
    ctx.stroke();

    // ---- blush ----
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(243,150,190,0.5)';
    ctx.beginPath(); ctx.ellipse(hx-5.5, hy+2.6, 2.5, 1.6, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx+6, hy+2.6, 2.5, 1.6, 0, 0, Math.PI*2); ctx.fill();

    // ---- big sparkly eyes (with blink) ----
    var bc = time % 3600;
    var blink = bc > 3380 ? Math.max(0, 1 - Math.abs(bc - 3480)/100) : 0;
    var eo = 4.3, ey = hy - 0.3;
    var erY = (rage>0.3 ? 3.2 : 3.1) * (1 - blink);
    var erX = rage>0.3 ? 2.5 : 2.7;
    [hx-eo, hx+eo].forEach(function(ex){
      if(rage > 0.3){ ctx.fillStyle = '#ff2a2a'; ctx.shadowColor = 'rgba(255,0,0,0.95)'; ctx.shadowBlur = 10; }
      else { ctx.fillStyle = '#3a2f52'; ctx.shadowBlur = 0; }
      ctx.beginPath(); ctx.ellipse(ex, ey, erX, Math.max(0.5, erY), 0, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
      if(blink < 0.4 && rage <= 0.3){
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(ex-0.9, ey-1.2, 0.95, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(ex+0.8, ey+0.8, 0.5, 0, Math.PI*2); ctx.fill();
      }
    });

    // ---- nose + mouth ----
    ctx.fillStyle = rage>0.3 ? '#ff5a7a' : pinkDeep;
    ctx.beginPath(); ctx.moveTo(hx-1.5, hy+3.4); ctx.lineTo(hx+1.5, hy+3.4); ctx.lineTo(hx, hy+5.1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, hy+5.1); ctx.quadraticCurveTo(hx-2, hy+6.6, hx-3.2, hy+5.4);
    ctx.moveTo(hx, hy+5.1); ctx.quadraticCurveTo(hx+2, hy+6.6, hx+3.2, hy+5.4);
    ctx.stroke();

    // ---- whiskers (gently curved) ----
    ctx.strokeStyle = 'rgba(185,164,245,0.75)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(hx+2, hy+3); ctx.quadraticCurveTo(hx+10, hy+1.5, hx+15, hy+2);
    ctx.moveTo(hx+2, hy+4.2); ctx.quadraticCurveTo(hx+10, hy+4.8, hx+15, hy+6);
    ctx.moveTo(hx-2, hy+3); ctx.quadraticCurveTo(hx-10, hy+1.5, hx-15, hy+2);
    ctx.moveTo(hx-2, hy+4.2); ctx.quadraticCurveTo(hx-10, hy+4.8, hx-15, hy+6);
    ctx.stroke();

    ctx.restore();

    // ---- speech bubble ----
    var sayText = null, fade = 0;
    if(rage > 0 && app.rageText){ sayText = app.rageText; fade = 1; }
    else if(cat.say && (cat.held || cat.pause > 0)){
      sayText = cat.say;
      fade = cat.held ? 1 : Math.min(1, cat.pause/22) * Math.min(1, (cat.sayMax - cat.pause)/12);
    }
    if(sayText && fade > 0.01) app.drawBubble(ctx, cat.x, cat.y, sayText, fade, rage > 0);
  };

  app.drawBubble = function(ctx, x, y, text, alpha, red){
    var boxFill = red ? 'rgba(26,3,3,0.96)' : 'rgba(13,10,22,0.96)';
    var boxLine = red ? 'rgba(255,55,55,0.95)' : 'rgba(139,92,246,0.85)';
    var glow = red ? 'rgba(255,0,0,0.65)' : 'rgba(124,58,237,0.5)';
    var txtCol = red ? '#ffdada' : '#ECEAF2';
    ctx.save();
    ctx.font = (red ? '700 ' : '600 ') + '12.5px "Plus Jakarta Sans", sans-serif';
    ctx.textBaseline = 'top';
    var maxW = 180, pad = 11, lh = 16;
    var words = text.split(' ');
    var lines = []; var cur = '';
    for(var wi=0; wi<words.length; wi++){
      var w = words[wi];
      var test = cur ? cur + ' ' + w : w;
      if(ctx.measureText(test).width > maxW && cur){ lines.push(cur); cur = w; }
      else cur = test;
    }
    if(cur) lines.push(cur);
    var tw = 0;
    for(var li=0; li<lines.length; li++) tw = Math.max(tw, ctx.measureText(lines[li]).width);
    var bw = tw + pad*2, bh = lines.length*lh + pad*2;
    var W = window.innerWidth;
    var bx = x - bw/2;
    bx = Math.max(10, Math.min(W - bw - 10, bx));
    var by = y - 30 - bh;          // float above the cat's head
    ctx.globalAlpha = alpha;
    ctx.shadowColor = glow; ctx.shadowBlur = 18;
    ctx.fillStyle = boxFill;
    ctx.fillRect(bx, by, bw, bh);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = boxLine; ctx.lineWidth = 1.4;
    ctx.strokeRect(bx, by, bw, bh);
    var tailX = Math.max(bx + 10, Math.min(bx + bw - 10, x));
    ctx.fillStyle = boxFill;
    ctx.beginPath();
    ctx.moveTo(tailX - 7, by + bh - 1);
    ctx.lineTo(tailX + 7, by + bh - 1);
    ctx.lineTo(tailX, by + bh + 9);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = boxLine;
    ctx.beginPath();
    ctx.moveTo(tailX - 7, by + bh); ctx.lineTo(tailX, by + bh + 9); ctx.lineTo(tailX + 7, by + bh); ctx.stroke();
    ctx.fillStyle = txtCol;
    for(var k=0;k<lines.length;k++){
      ctx.fillText(lines[k], bx + pad, by + pad + k*lh);
    }
    ctx.restore();
  };

  app.drawRageOverlay = function(ctx, W, H, now, f){
    var pulse = 0.6 + 0.4*Math.sin(now*0.006);
    var g = ctx.createRadialGradient(W/2, H/2, H*0.12, W/2, H/2, Math.max(W,H)*0.72);
    g.addColorStop(0,   'rgba(150,0,0,' + (0.05*f).toFixed(3) + ')');
    g.addColorStop(0.55,'rgba(150,0,0,' + (0.14*f).toFixed(3) + ')');
    g.addColorStop(1,   'rgba(110,0,0,' + (0.42*f*pulse).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };

  app.drawSigil = function(ctx, cx, cy, now, f){
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = f;
    ctx.strokeStyle = 'rgba(255,40,40,0.9)';
    ctx.shadowColor = 'rgba(255,0,0,0.95)';
    ctx.shadowBlur = 14;
    var R = 46 + Math.sin(now*0.005)*3;
    var rot = now * 0.001;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R*0.74, 0, Math.PI*2); ctx.stroke();
    for(var tri = 0; tri < 2; tri++){
      var off = rot*(tri ? -1 : 1) + (tri ? Math.PI/3 : 0);
      ctx.beginPath();
      for(var i = 0; i < 3; i++){
        var a = off + i*2*Math.PI/3;
        var x = Math.cos(a)*R*0.7, y = Math.sin(a)*R*0.7;
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
    }
    ctx.lineWidth = 2;
    var ticks = 12;
    for(var j = 0; j < ticks; j++){
      var aa = rot*0.5 + j/ticks*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(aa)*R, Math.sin(aa)*R);
      ctx.lineTo(Math.cos(aa)*(R+6), Math.sin(aa)*(R+6));
      ctx.stroke();
    }
    ctx.restore();
  };

  app.init = function(){
    app.onResize();
    window.addEventListener('resize', app.onResize);
    window.addEventListener('mousemove', app.onMouse);
    window.addEventListener('mousedown', app.onDown);
    window.addEventListener('mouseup', app.onUp);

    var SPACING = 34;
    var R = 200, R2 = R*R;
    var CR = 150, CR2 = CR*CR;          // cat magnet radius
    app.cat = {
      x: window.innerWidth*0.5, y: window.innerHeight*0.5,
      tx: window.innerWidth*0.5, ty: window.innerHeight*0.5,
      facing: 1, phase: 0, pause: 0, held: false,
    };
    var tick = function(){
      var dpr = app.dpr || 1;
      var W = window.innerWidth, H = window.innerHeight;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,W,H);
      ctx.lineCap = 'round';
      var now = performance.now();
      var t = now * 0.00018;
      var mx = app.mouse.x, my = app.mouse.y;
      var vcx1 = W*(0.5 + 0.30*Math.sin(now*0.00013)), vcy1 = H*(0.46 + 0.30*Math.cos(now*0.00011));
      var vcx2 = W*(0.5 + 0.32*Math.cos(now*0.00010)), vcy2 = H*(0.54 + 0.26*Math.sin(now*0.00009));
      var rageF = now < app.rageUntil ? Math.min(1, (app.rageUntil - now)/700) : 0;
      var fcR = Math.round(173 + (255-173)*rageF);
      var fcG = Math.round(143 + (35-143)*rageF);
      var fcB = Math.round(250 + (35-250)*rageF);
      var cat = app.cat;
      app.updateCat(cat, W, H);
      var len = SPACING * 0.46;
      for(var gx = SPACING*0.5; gx < W; gx += SPACING){
        for(var gy = SPACING*0.5; gy < H; gy += SPACING){
          var vdx1 = gx - vcx1, vdy1 = gy - vcy1, vr1 = Math.hypot(vdx1, vdy1) + 1;
          var vdx2 = gx - vcx2, vdy2 = gy - vcy2, vr2 = Math.hypot(vdx2, vdy2) + 1;
          var w1 = 1/(1 + vr1/280), w2 = 1/(1 + vr2/280);
          var vx = (-vdy1/vr1)*w1 + ( vdy2/vr2)*w2 + Math.cos((gx+gy)*0.003 + t)*0.10;
          var vy = ( vdx1/vr1)*w1 + (-vdx2/vr2)*w2 + Math.sin((gx-gy)*0.003 - t)*0.10;
          if(rageF > 0){
            var sdx = gx - W*0.5, sdy = gy - H*0.5, sd = Math.hypot(sdx, sdy) + 1;
            vx += (-sdy/sd)*rageF*1.7; vy += (sdx/sd)*rageF*1.7;
          }
          var shimmer = 0.5 + 0.5*Math.sin(Math.atan2(vdy1, vdx1)*3 + vr1*0.03 - now*(0.004 + rageF*0.02));
          var bright = (0.05 + shimmer*0.15) * (1 + rageF*1.6) + rageF*0.12, width = 1;
          var bestInfl = 0, sAng = 0;
          var dx = gx - mx, dy = gy - my, d2 = dx*dx + dy*dy;
          if(d2 < R2){
            var infl = 1 - Math.sqrt(d2)/R;
            bestInfl = infl; sAng = Math.atan2(dy, dx) + Math.PI*0.5;
          }
          var cdx = gx - cat.x, cdy = gy - cat.y, cd2 = cdx*cdx + cdy*cdy;
          if(cd2 < CR2){
            var cinfl = 1 - Math.sqrt(cd2)/CR;
            if(cinfl > bestInfl){ bestInfl = cinfl; sAng = Math.atan2(cdy, cdx) + Math.PI*0.5; }
          }
          if(bestInfl > 0){
            var sx = Math.cos(sAng), sy = Math.sin(sAng);
            vx += (sx - vx) * bestInfl;
            vy += (sy - vy) * bestInfl;
            bright = 0.10 + bestInfl*0.85;
            width = 1 + bestInfl*1.4;
          }
          var mlen = Math.hypot(vx, vy) || 1;
          var hx = (vx/mlen) * len * 0.5, hy = (vy/mlen) * len * 0.5;
          ctx.strokeStyle = 'rgba(' + fcR + ',' + fcG + ',' + fcB + ',' + bright.toFixed(3) + ')';
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(gx - hx, gy - hy);
          ctx.lineTo(gx + hx, gy + hy);
          ctx.stroke();
          if(bright > 0.55){
            ctx.fillStyle = 'rgba(210,190,255,' + ((bright-0.55)*0.9).toFixed(3) + ')';
            ctx.beginPath(); ctx.arc(gx, gy, 1.4, 0, Math.PI*2); ctx.fill();
          }
        }
      }
      if(catCtx){
        catCtx.setTransform(dpr,0,0,dpr,0,0);
        catCtx.clearRect(0,0,W,H);
        catCtx.lineCap = 'round';
        if(rageF > 0){
          app.drawRageOverlay(catCtx, W, H, now, rageF);
          app.drawSigil(catCtx, cat.x, cat.y, now, rageF);
        }
        app.drawCat(catCtx, cat, performance.now(), rageF);
      } else {
        app.drawCat(ctx, cat, performance.now(), rageF);
      }
      app.raf = requestAnimationFrame(tick);
    };
    app.raf = requestAnimationFrame(tick);
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', app.init);
  } else {
    app.init();
  }
})();
