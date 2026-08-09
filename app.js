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
    state: 'roam',          // roam | perch | sleep | chase
    lastMove: 0,            // for the idle -> sleep timer
    downAt: 0, downX: 0, downY: 0, moved: false,
    nextPerch: 0, perchEl: null, perchUntil: 0, knocked: false,
    laser: null, laserUntil: 0,
    hearts: [], paws: [], wake: 0,
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
    app.lastMove = performance.now();
    var cat = app.cat; if(!cat) return;
    if(app.drag){
      app.moved = true;
      cat.x = Math.max(20, Math.min(window.innerWidth - 20, e.clientX));
      cat.y = Math.max(20, Math.min(window.innerHeight - 20, e.clientY));
    } else {
      // a moving cursor near a sleeping cat wakes it
      if(app.state === 'sleep' && Math.hypot(e.clientX - cat.x, e.clientY - cat.y) < 260) app.wakeUp();
      var near = Math.hypot(e.clientX - cat.x, e.clientY - cat.y) < app.grabR;
      document.body.style.cursor = near ? 'grab' : '';
    }
  };

  app.wakeUp = function(){
    if(app.state !== 'sleep') return;
    app.state = 'roam';
    app.wake = performance.now() + 650;      // stretch before walking off
    app.cat.pause = 40;
  };

  // Pet: a tap that never turned into a drag.
  app.pet = function(){
    var cat = app.cat; if(!cat) return;
    cat.purr = performance.now() + 2200;
    // spawn above the head, not on the cat's back
    for(var i=0;i<6;i++){
      app.hearts.push({
        x: cat.x + cat.facing*9 + (Math.random()*18-9),
        y: cat.y - 24 - Math.random()*6,
        vx: (Math.random()-0.5)*0.45, vy: -(0.45 + Math.random()*0.6),
        life: 1, size: 3.4 + Math.random()*2.6
      });
    }
  };

  app.onDown = function(e){
    var cat = app.cat; if(!cat) return;
    app.downAt = performance.now(); app.downX = e.clientX; app.downY = e.clientY; app.moved = false;
    if(app.state === 'sleep'){ app.wakeUp(); return; }
    if(Math.hypot(e.clientX - cat.x, e.clientY - cat.y) < app.grabR){
      app.drag = true; cat.held = true;
      cat.say = app.protests[(Math.random()*app.protests.length)|0];
      cat.pause = 0;
      document.body.style.cursor = 'grabbing';
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

  app.onUp = function(e){
    var cat = app.cat;
    var quick = performance.now() - app.downAt < 260;
    var still = Math.hypot((e && e.clientX || app.downX) - app.downX,
                           (e && e.clientY || app.downY) - app.downY) < 8;
    if(app.drag){
      app.drag = false;
      if(cat){ cat.held = false; cat.say = null; cat.tx = cat.x; cat.ty = cat.y; }
      document.body.style.cursor = '';
      if(quick && still && !app.moved) app.pet();      // tapped, not dragged
      return;
    }
    // tap on empty space near the cat = pet it too
    if(cat && quick && still && Math.hypot(app.downX - cat.x, app.downY - cat.y) < app.grabR + 14) app.pet();
  };

  // Laser pointer: press L (or double-click anywhere) and the cat loses its mind.
  app.startLaser = function(){
    app.laser = { x: app.mouse.x, y: app.mouse.y };
    app.laserUntil = performance.now() + 9000;
    app.state = 'chase';
    if(app.cat){ app.cat.pause = 0; app.cat.say = null; }
    app.releasePerch();
  };

  app.releasePerch = function(){
    app.perchEl = null; app.knocked = false;
  };

  // ---- perching: sit on a real element's top edge, occasionally nudge it ----
  app.perchTargets = function(){
    var sel = '.panel,.st-tier,.dash-card,.rev,.fcard,.cta,.dc,.acc,.stat-row,.plan,.stack,.cmp,.fx';
    var out = [];
    var nodes = document.querySelectorAll(sel);
    for(var i=0;i<nodes.length && out.length<24;i++){
      var r = nodes[i].getBoundingClientRect();
      if(r.width > 150 && r.top > 90 && r.top < window.innerHeight - 60) out.push({el:nodes[i], r:r});
    }
    return out;
  };

  app.pickPerch = function(now){
    var t = app.perchTargets();
    if(!t.length){ app.nextPerch = now + 9000; return false; }
    var pick = t[(Math.random()*t.length)|0];
    var r = pick.r;
    app.perchEl = pick.el;
    app.knocked = false;
    app.state = 'perch';
    app.cat.tx = r.left + 30 + Math.random()*Math.max(1, r.width - 60);
    app.cat.ty = r.top - 13;                   // feet on the ledge
    app.cat.pause = 0;
    return true;
  };

  app.updateCat = function(cat, W, H){
    var now = performance.now();
    if(app.drag){ cat.phase += 0.32; return; }
    if(now < app.wake){ cat.phase += 0.05; return; }   // mid-stretch

    // --- laser chase ---
    if(app.state === 'chase'){
      if(now > app.laserUntil || !app.laser){ app.laser = null; app.state = 'roam'; }
      else {
        app.laser.x += (app.mouse.x - app.laser.x) * 0.25;
        app.laser.y += (app.mouse.y - app.laser.y) * 0.25;
        var ldx = app.laser.x - cat.x, ldy = app.laser.y - cat.y;
        var ld = Math.hypot(ldx, ldy);
        if(ld > 14){
          var sp = 3.4;
          cat.x += (ldx/ld)*sp; cat.y += (ldy/ld)*sp;
          if(Math.abs(ldx) > 1.5) cat.facing = ldx < 0 ? -1 : 1;
          cat.phase += 0.5;
          app.dropPaw(cat, now, 9);
        } else { cat.phase += 0.3; }
        return;
      }
    }

    // --- sleep after a long idle ---
    if(app.state !== 'sleep' && app.lastMove && now - app.lastMove > 22000 && !cat.held){
      app.state = 'sleep'; app.releasePerch(); cat.say = null; cat.pause = 0;
    }
    if(app.state === 'sleep'){ cat.phase += 0.012; return; }

    // --- perched: sit, maybe knock the thing over ---
    if(app.state === 'perch'){
      if(!app.perchEl || !document.body.contains(app.perchEl)){ app.state = 'roam'; app.releasePerch(); }
      else {
        var pr = app.perchEl.getBoundingClientRect();
        if(pr.bottom < 0 || pr.top > H){ app.state = 'roam'; app.releasePerch(); }  // scrolled away
        else {
          cat.ty = pr.top - 13;
          var pdx = cat.tx - cat.x, pdy = cat.ty - cat.y, pd = Math.hypot(pdx, pdy);
          if(pd > 4){
            var ps = 1.6;
            cat.x += (pdx/pd)*ps; cat.y += (pdy/pd)*ps;
            if(Math.abs(pdx) > 1.5) cat.facing = pdx < 0 ? -1 : 1;
            cat.phase += 0.22;
            app.dropPaw(cat, now, 16);
            return;
          }
          if(!app.perchUntil){ app.perchUntil = now + 8000 + Math.random()*7000; }
          cat.phase += 0.03;
          // the obligatory nudge
          if(!app.knocked && now > app.perchUntil - 3200){
            app.knocked = true;
            var el = app.perchEl;
            el.classList.add('cat-knock');
            setTimeout(function(){ el.classList.remove('cat-knock'); }, 700);
            cat.say = app.phrases[(Math.random()*app.phrases.length)|0];
            cat.sayMax = 200; cat.pause = 200;
          }
          if(now > app.perchUntil){
            app.perchUntil = 0; app.state = 'roam'; app.releasePerch();
            app.nextPerch = now + 14000 + Math.random()*16000;
          }
          return;
        }
      }
    }

    // --- default roaming (original behaviour) ---
    var m = 90;
    if(cat.pause > 0){ cat.pause--; cat.phase += 0.04; return; }
    if(now > app.nextPerch && Math.random() < 0.5 && app.pickPerch(now)) return;
    var dx = cat.tx - cat.x, dy = cat.ty - cat.y;
    var d = Math.hypot(dx, dy);
    if(d < 26){
      cat.tx = m + Math.random()*(W - 2*m);
      cat.ty = m + Math.random()*(H - 2*m);
      if(Math.random() < 0.55){
        cat.pause = 200 + Math.random()*160;
        cat.say = app.phrases[(Math.random()*app.phrases.length)|0];
        cat.sayMax = cat.pause;
      }
      return;
    }
    var sp2 = 1.15;
    cat.x += (dx/d) * sp2;
    cat.y += (dy/d) * sp2;
    if(Math.abs(dx) > 1.5) cat.facing = dx < 0 ? -1 : 1;
    cat.phase += 0.22;
    app.dropPaw(cat, now, 18);
  };

  app.dropPaw = function(cat, now, every){
    if(!app.paws) app.paws = [];
    if(now - (app.lastPaw||0) < every*16) return;
    app.lastPaw = now;
    app.paws.push({ x: cat.x - cat.facing*10, y: cat.y + 12, a: 1, r: cat.facing });
    if(app.paws.length > 26) app.paws.shift();
  };

  app.drawExtras = function(ctx, now){
    var i;
    // paw prints
    for(i=app.paws.length-1;i>=0;i--){
      var pw = app.paws[i];
      pw.a -= 0.008;
      if(pw.a <= 0){ app.paws.splice(i,1); continue; }
      ctx.save();
      ctx.globalAlpha = pw.a * 0.5;
      ctx.fillStyle = '#b9a4f5';
      ctx.beginPath(); ctx.ellipse(pw.x, pw.y, 2.4, 1.9, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(pw.x - 2.4*pw.r, pw.y - 2.4, 0.9, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(pw.x, pw.y - 3.1, 0.9, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(pw.x + 2.4*pw.r, pw.y - 2.4, 0.9, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
    // hearts from petting
    for(i=app.hearts.length-1;i>=0;i--){
      var h = app.hearts[i];
      h.x += h.vx; h.y += h.vy; h.vy -= 0.004; h.life -= 0.011;
      if(h.life <= 0){ app.hearts.splice(i,1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, h.life);
      ctx.fillStyle = '#f3a6c8';
      ctx.shadowColor = 'rgba(243,166,200,0.9)'; ctx.shadowBlur = 10;
      var sz = h.size;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y + sz*0.35);
      ctx.bezierCurveTo(h.x - sz, h.y - sz*0.35, h.x - sz*0.35, h.y - sz, h.x, h.y - sz*0.35);
      ctx.bezierCurveTo(h.x + sz*0.35, h.y - sz, h.x + sz, h.y - sz*0.35, h.x, h.y + sz*0.35);
      ctx.fill();
      ctx.restore();
    }
    // laser dot
    if(app.laser){
      ctx.save();
      var pulse = 3 + Math.sin(now*0.02)*1.2;
      ctx.shadowColor = 'rgba(255,40,80,0.95)'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#ff2a50';
      ctx.beginPath(); ctx.arc(app.laser.x, app.laser.y, pulse, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
    // zzz while asleep
    if(app.state === 'sleep' && app.cat){
      ctx.save();
      ctx.font = '600 13px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(199,162,255,0.9)';
      for(var z=0; z<3; z++){
        var ph = (now*0.0011 + z*0.33) % 1;
        ctx.globalAlpha = (1 - ph) * 0.85;
        ctx.fillText('z', app.cat.x + 14 + ph*16, app.cat.y - 16 - ph*26);
      }
      ctx.restore();
    }
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
    if(app.state === 'sleep') blink = 1;                       // eyes shut
    if(app.cat && app.cat.purr > time) blink = 0.72;           // happy squint
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
    // pointer events so phones can pet and drag the cat too
    window.addEventListener('pointermove', app.onMouse, {passive:true});
    window.addEventListener('pointerdown', app.onDown);
    window.addEventListener('pointerup', app.onUp);
    window.addEventListener('pointercancel', app.onUp);
    window.addEventListener('dblclick', function(){ app.startLaser(); });
    window.addEventListener('keydown', function(e){
      if(e.key === 'l' || e.key === 'L'){
        var t = e.target && e.target.tagName;
        if(t === 'INPUT' || t === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
        app.startLaser();
      }
      if(e.key === 'Escape'){ app.laser = null; if(app.state === 'chase') app.state = 'roam'; }
    });
    // stop burning frames in a background tab
    document.addEventListener('visibilitychange', function(){
      if(document.hidden){ cancelAnimationFrame(app.raf); app.raf = 0; }
      else if(!app.raf){ app.lastMove = performance.now(); app.raf = requestAnimationFrame(app.tick); }
    });
    app.lastMove = performance.now();
    app.nextPerch = performance.now() + 6000;

    var SPACING = 34;
    var R = 200, R2 = R*R;
    var CR = 150, CR2 = CR*CR;          // cat magnet radius
    app.cat = {
      x: window.innerWidth*0.5, y: window.innerHeight*0.5,
      tx: window.innerWidth*0.5, ty: window.innerHeight*0.5,
      facing: 1, phase: 0, pause: 0, held: false, purr: 0,
    };
    var tick = app.tick = function(){
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
        app.drawExtras(catCtx, now);
        app.drawCat(catCtx, cat, performance.now(), rageF);
      } else {
        app.drawExtras(ctx, now);
        app.drawCat(ctx, cat, performance.now(), rageF);
      }
      app.raf = requestAnimationFrame(tick);
    };
    app.raf = requestAnimationFrame(tick);
  };

  // exposed so the cat can be poked from the console:
  //   NenyooCat.startLaser()  NenyooCat.pickPerch(performance.now())
  //   NenyooCat.state = 'sleep'   NenyooCat.pet()
  window.NenyooCat = app;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', app.init);
  } else {
    app.init();
  }
})();
