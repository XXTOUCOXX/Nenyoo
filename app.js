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
    nextPerch: 0, perchEl: null, perchUntil: 0, knocked: false, pendingPerch: false,
    laser: null, laserUntil: 0,
    hearts: [], paws: [], wake: 0, trail: [],
    jump: null, prevState: 'roam', zoomUntil: 0, ctaUntil: 0,
    key: null, nextKey: 0, carryUntil: 0, lastTap: 0,
    save: null, cat2: null,
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

  /* ============================================================
     CAT BEHAVIOUR
     states: roam | perch | jump | sleep | chase | zoom | thrown | cta
     ============================================================ */

  // ---------- persistence: what this visitor has done with the cat ----------
  app.SAVE_KEY = 'nenyoo_cat';
  app.loadSave = function(){
    var d = { pets:0, grabs:0, laser:0, zoom:0 };
    try { var j = JSON.parse(localStorage.getItem(app.SAVE_KEY) || '{}');
          for(var k in d) if(typeof j[k] === 'number') d[k] = j[k]; } catch(e){}
    return d;
  };
  app.store = function(){
    try { localStorage.setItem(app.SAVE_KEY, JSON.stringify(app.save)); } catch(e){}
  };

  // ---------- accessories: seasonal first, then earned ----------
  app.accessory = function(){
    var m = new Date().getMonth();
    if(m === 11) return 'santa';
    if(m === 9)  return 'pumpkin';
    var p = app.save.pets;
    if(p >= 50) return 'crown';
    if(p >= 25) return 'shades';
    if(p >= 10) return 'hat';
    return null;
  };

  app.UNLOCKS = [
    { at:10, acc:'hat',    text:'the cat trusts you. it found a hat.' },
    { at:25, acc:'shades', text:'25 pets. the cat has acquired sunglasses.' },
    { at:50, acc:'crown',  text:'50 pets. the cat is now management.' }
  ];

  app.toast = function(msg){
    var el = document.createElement('div');
    el.className = 'cat-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function(){ el.classList.add('out'); }, 3600);
    setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 4400);
  };

  app.checkUnlock = function(){
    for(var i=0;i<app.UNLOCKS.length;i++){
      if(app.save.pets === app.UNLOCKS[i].at){ app.toast(app.UNLOCKS[i].text); return; }
    }
  };

  // ---------- per-page lines ----------
  app.pagePhrases = function(){
    var p = location.pathname.replace(/\.html$/,'');
    if(/store/.test(p))    return ['mvp or nothing tbh','the sale timer is real btw','buy it, i get treats'];
    if(/download/.test(p)) return ['battleye OFF first, trust','whitelist the loader ty','press insert once ur in'];
    if(/freekey/.test(p))  return ['free key gang','resets every 48h, dw','ngl mvp is better'];
    if(/roadmap/.test(p))  return ['im in the next update','1216 options and counting','they let me pick one'];
    if(/guides/.test(p))   return ['read it. please.','i wrote none of these','ctrl+f is your friend'];
    if(/dashboard/.test(p))return ['welcome back boss','ur hwid looks fine to me','dont log out'];
    if(/404/.test(p))      return ['i broke it','nothing here. my bad.','try the nav, genius'];
    return null;
  };
  app.speak = function(cat){
    var pool = app.pagePhrases();
    var all = pool ? app.phrases.concat(pool) : app.phrases;
    cat.say = all[(Math.random()*all.length)|0];
  };

  // ---------- pointer ----------
  app.onMouse = function(e){
    app.mouse.x = e.clientX; app.mouse.y = e.clientY;
    app.lastMove = performance.now();
    var cat = app.cat; if(!cat) return;
    if(app.drag){
      app.moved = true;
      cat.x = Math.max(20, Math.min(window.innerWidth - 20, e.clientX));
      cat.y = Math.max(20, Math.min(window.innerHeight - 20, e.clientY));
      app.trail.push({ x:cat.x, y:cat.y, t:performance.now() });
      if(app.trail.length > 6) app.trail.shift();
    } else {
      if(app.state === 'sleep' && Math.hypot(e.clientX - cat.x, e.clientY - cat.y) < 260) app.wakeUp();
      var near = Math.hypot(e.clientX - cat.x, e.clientY - cat.y) < app.grabR;
      document.body.style.cursor = near ? 'grab' : '';
    }
  };

  app.wakeUp = function(){
    if(app.state !== 'sleep') return;
    app.state = 'roam';
    app.wake = performance.now() + 650;
    app.cat.pause = 40;
  };

  app.pet = function(){
    var cat = app.cat; if(!cat) return;
    cat.purr = performance.now() + 2200;
    app.save.pets++; app.store();
    app.checkUnlock();
    cat.acc = app.accessory();
    if(cat.carry){ app.dropKey(cat); }            // startled into dropping the loot
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
    var now = performance.now();
    app.downAt = now; app.downX = e.clientX; app.downY = e.clientY; app.moved = false;
    if(app.state === 'sleep'){ app.wakeUp(); return; }
    if(Math.hypot(e.clientX - cat.x, e.clientY - cat.y) < app.grabR){
      // double-tap the cat = zoomies
      if(now - (app.lastTap||0) < 320){ app.zoomies(); app.lastTap = 0; return; }
      app.lastTap = now;
      app.drag = true; cat.held = true;
      app.trail = [{ x:cat.x, y:cat.y, t:now }];
      cat.say = app.protests[(Math.random()*app.protests.length)|0];
      cat.pause = 0;
      document.body.style.cursor = 'grabbing';
      app.save.grabs++; app.store();
      if(now > app.rageUntil){
        app.grabCount++;
        if(app.grabCount >= 5){
          app.rageUntil = now + 7000;
          app.rageText = app.rageLines[(Math.random()*app.rageLines.length)|0];
          app.grabCount = 0;
        }
      }
    }
  };

  app.onUp = function(e){
    var cat = app.cat;
    var now = performance.now();
    var quick = now - app.downAt < 260;
    var still = Math.hypot((e && e.clientX || app.downX) - app.downX,
                           (e && e.clientY || app.downY) - app.downY) < 8;
    if(app.drag){
      app.drag = false;
      if(cat){ cat.held = false; cat.say = null; cat.tx = cat.x; cat.ty = cat.y; }
      document.body.style.cursor = '';
      if(quick && still && !app.moved){ app.pet(); return; }
      // flick to throw
      var tr = app.trail;
      if(cat && tr.length >= 2){
        var a = tr[0], b = tr[tr.length-1];
        var dt = Math.max(16, b.t - a.t);
        var vx = (b.x - a.x) / dt * 16, vy = (b.y - a.y) / dt * 16;
        if(Math.hypot(vx, vy) > 6){
          cat.vx = Math.max(-38, Math.min(38, vx));
          cat.vy = Math.max(-38, Math.min(38, vy));
          app.state = 'thrown';
          app.releasePerch();
          cat.say = app.protests[(Math.random()*app.protests.length)|0];
          cat.sayMax = 90; cat.pause = 90;
        }
      }
      return;
    }
    if(cat && quick && still && Math.hypot(app.downX - cat.x, app.downY - cat.y) < app.grabR + 14) app.pet();
  };

  app.zoomies = function(){
    app.state = 'zoom';
    app.zoomUntil = performance.now() + 3600;
    app.releasePerch();
    app.cat.pause = 0; app.cat.say = null;
    app.save.zoom++; app.store();
  };

  app.startLaser = function(){
    app.laser = { x: app.mouse.x, y: app.mouse.y };
    app.laserUntil = performance.now() + 9000;
    app.state = 'chase';
    if(app.cat){ app.cat.pause = 0; app.cat.say = null; }
    app.releasePerch();
    app.save.laser++; app.store();
  };

  app.releasePerch = function(){ app.perchEl = null; app.knocked = false; app.perchUntil = 0; };

  // ---------- ballistic hop ----------
  app.jumpTo = function(cat, tx, ty){
    var d = Math.hypot(tx - cat.x, ty - cat.y);
    app.prevState = (app.state === 'jump') ? 'roam' : app.state;
    app.state = 'jump';
    app.jump = {
      sx: cat.x, sy: cat.y, ex: tx, ey: ty,
      t0: performance.now(),
      dur: Math.min(900, 260 + d * 1.05),
      arc: Math.min(120, 38 + d * 0.30)
    };
    if(Math.abs(tx - cat.x) > 2) cat.facing = tx < cat.x ? -1 : 1;
  };

  // ---------- perching ----------
  app.perchTargets = function(){
    var sel = '.panel,.st-tier,.dash-card,.rev,.fcard,.cta,.dc,.acc,.stat-row,.plan,.stack,.cmp,.fx,.np';
    var out = [], nodes = document.querySelectorAll(sel);
    for(var i=0;i<nodes.length && out.length<24;i++){
      var r = nodes[i].getBoundingClientRect();
      if(r.width > 150 && r.top > 90 && r.top < window.innerHeight - 60) out.push({el:nodes[i], r:r});
    }
    return out;
  };

  app.pickPerch = function(now){
    var t = app.perchTargets();
    if(!t.length){ app.nextPerch = now + 9000; return false; }
    var pick = t[(Math.random()*t.length)|0], r = pick.r;
    app.perchEl = pick.el;
    app.knocked = false;
    app.pendingPerch = true;
    app.cat.tx = r.left + 30 + Math.random()*Math.max(1, r.width - 60);
    app.cat.ty = r.top - 13;
    app.jumpTo(app.cat, app.cat.tx, app.cat.ty);   // hop up, don't float
    return true;
  };

  // ---------- the cat steals your licence key ----------
  app.spawnKey = function(now){
    var m = 120;
    app.key = {
      x: m + Math.random()*(window.innerWidth - 2*m),
      y: m + Math.random()*(window.innerHeight - 2*m),
      born: now
    };
    app.nextKey = now + 60000 + Math.random()*60000;
  };
  app.dropKey = function(cat){
    if(!cat.carry) return;
    cat.carry = null;
    app.key = { x: cat.x, y: cat.y + 10, born: performance.now(), dropped: true };
    app.nextKey = performance.now() + 45000;
  };

  // ---------- main update ----------
  app.updateCat = function(cat, W, H){
    var now = performance.now();
    cat.sleeping = (app.state === 'sleep');
    if(cat.sq === undefined) cat.sq = 1;
    cat.sq += (1 - cat.sq) * 0.18;                 // ease squash back to normal
    cat.z = 0;

    if(app.drag){ cat.phase += 0.32; return; }
    if(now < app.wake){ cat.phase += 0.05; return; }

    // --- mid-hop ---
    if(app.state === 'jump'){
      var j = app.jump, p = Math.min(1, (now - j.t0) / j.dur);
      cat.x = j.sx + (j.ex - j.sx) * p;
      cat.y = j.sy + (j.ey - j.sy) * p;
      cat.z = Math.sin(Math.PI * p) * j.arc;
      cat.sq = p < 0.12 ? 1.22 : (p > 0.9 ? 0.82 : 1 + Math.sin(Math.PI*p)*0.06);
      cat.phase += 0.06;
      if(p >= 1){
        cat.sq = 0.74;                              // land squash
        if(app.pendingPerch){ app.pendingPerch = false; app.state = 'perch'; app.perchUntil = 0; }
        else app.state = app.prevState === 'perch' ? 'roam' : (app.prevState || 'roam');
      }
      return;
    }

    // --- thrown ---
    if(app.state === 'thrown'){
      cat.x += cat.vx; cat.y += cat.vy;
      cat.vx *= 0.94; cat.vy *= 0.94;
      var pad = 26;
      if(cat.x < pad){ cat.x = pad; cat.vx = Math.abs(cat.vx)*0.55; }
      if(cat.x > W-pad){ cat.x = W-pad; cat.vx = -Math.abs(cat.vx)*0.55; }
      if(cat.y < pad){ cat.y = pad; cat.vy = Math.abs(cat.vy)*0.55; }
      if(cat.y > H-pad){ cat.y = H-pad; cat.vy = -Math.abs(cat.vy)*0.55; }
      cat.phase += 0.4;
      if(Math.abs(cat.vx) > 1.5) cat.facing = cat.vx < 0 ? -1 : 1;
      app.dropPaw(cat, now, 8);
      if(Math.hypot(cat.vx, cat.vy) < 0.7){
        cat.vx = cat.vy = 0; app.state = 'roam';
        cat.pause = 60; cat.tx = cat.x; cat.ty = cat.y;
      }
      return;
    }

    // --- zoomies ---
    if(app.state === 'zoom'){
      if(now > app.zoomUntil){ app.state = 'roam'; cat.pause = 90; cat.tx = cat.x; cat.ty = cat.y; }
      else {
        var zdx = cat.tx - cat.x, zdy = cat.ty - cat.y, zd = Math.hypot(zdx, zdy);
        if(zd < 40){
          var zm = 70;
          cat.tx = zm + Math.random()*(W - 2*zm);
          cat.ty = zm + Math.random()*(H - 2*zm);
        } else {
          var zs = 6.2;
          cat.x += (zdx/zd)*zs; cat.y += (zdy/zd)*zs;
          if(Math.abs(zdx) > 1.5) cat.facing = zdx < 0 ? -1 : 1;
        }
        cat.phase += 0.62;
        app.dropPaw(cat, now, 5);
        return;
      }
    }

    // --- laser chase ---
    if(app.state === 'chase'){
      if(now > app.laserUntil || !app.laser){ app.laser = null; app.state = 'roam'; }
      else {
        app.laser.x += (app.mouse.x - app.laser.x) * 0.25;
        app.laser.y += (app.mouse.y - app.laser.y) * 0.25;
        var ldx = app.laser.x - cat.x, ldy = app.laser.y - cat.y, ld = Math.hypot(ldx, ldy);
        if(ld > 14){
          cat.x += (ldx/ld)*3.4; cat.y += (ldy/ld)*3.4;
          if(Math.abs(ldx) > 1.5) cat.facing = ldx < 0 ? -1 : 1;
          cat.phase += 0.5;
          app.dropPaw(cat, now, 9);
        } else cat.phase += 0.3;
        return;
      }
    }

    // --- someone is hovering a CTA: go look at it ---
    if(app.state === 'cta'){
      if(now > app.ctaUntil){ app.state = 'roam'; cat.pause = 40; cat.tx = cat.x; cat.ty = cat.y; }
      else { cat.phase += 0.03; return; }
    }

    // --- sleep: idle, or parked at the bottom of the page ---
    var atBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 60);
    if(app.state !== 'sleep' && !cat.held &&
       ((app.lastMove && now - app.lastMove > 22000) || (atBottom && now - app.lastMove > 6000))){
      app.state = 'sleep'; app.releasePerch(); cat.say = null; cat.pause = 0;
      if(cat.carry) app.dropKey(cat);
    }
    if(app.state === 'sleep'){ cat.phase += 0.012; return; }

    // --- perched ---
    if(app.state === 'perch'){
      if(!app.perchEl || !document.body.contains(app.perchEl)){ app.state='roam'; app.releasePerch(); }
      else {
        var pr = app.perchEl.getBoundingClientRect();
        if(pr.bottom < 0 || pr.top > H){ app.state='roam'; app.releasePerch(); }
        else {
          cat.y = pr.top - 13;
          cat.x = Math.max(pr.left + 18, Math.min(pr.right - 18, cat.x));
          if(!app.perchUntil) app.perchUntil = now + 8000 + Math.random()*7000;
          cat.phase += 0.03;
          if(!app.knocked && now > app.perchUntil - 3200){
            app.knocked = true;
            var el = app.perchEl;
            el.classList.add('cat-knock');
            setTimeout(function(){ el.classList.remove('cat-knock'); }, 700);
            app.speak(cat); cat.sayMax = 200; cat.pause = 200;
          }
          if(now > app.perchUntil){
            app.releasePerch(); app.state = 'roam';
            app.nextPerch = now + 14000 + Math.random()*16000;
          }
          return;
        }
      }
    }

    // --- roam ---
    var m2 = 90;
    if(cat.pause > 0){ cat.pause--; cat.phase += 0.04; return; }

    // grab the key if one is lying around
    if(app.key && !cat.carry){
      var kdx = app.key.x - cat.x, kdy = app.key.y - cat.y, kd = Math.hypot(kdx, kdy);
      if(kd < 20){
        cat.carry = 'key'; app.key = null;
        cat.say = 'finders keepers'; cat.sayMax = 170; cat.pause = 170;
        return;
      }
      cat.tx = app.key.x; cat.ty = app.key.y;
      if(kd > 200 && app.state !== 'jump'){ app.jumpTo(cat, cat.tx, cat.ty); return; }
      cat.x += (kdx/kd)*1.9; cat.y += (kdy/kd)*1.9;
      if(Math.abs(kdx) > 1.5) cat.facing = kdx < 0 ? -1 : 1;
      cat.phase += 0.3;
      app.dropPaw(cat, now, 14);
      return;
    }
    if(!app.key && !cat.carry && now > app.nextKey) app.spawnKey(now);
    if(cat.carry && now > (app.carryUntil||0)) app.dropKey(cat);
    if(cat.carry && !app.carryUntil) app.carryUntil = now + 22000;
    if(!cat.carry) app.carryUntil = 0;

    if(now > app.nextPerch && Math.random() < 0.5 && app.pickPerch(now)) return;

    var dx = cat.tx - cat.x, dy = cat.ty - cat.y, d = Math.hypot(dx, dy);
    if(d < 26){
      cat.tx = m2 + Math.random()*(W - 2*m2);
      cat.ty = m2 + Math.random()*(H - 2*m2);
      if(Math.random() < 0.55){
        cat.pause = 200 + Math.random()*160;
        app.speak(cat);
        cat.sayMax = cat.pause;
      }
      return;
    }
    cat.x += (dx/d) * 1.15;
    cat.y += (dy/d) * 1.15;
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
    if(app.key){
      ctx.save();
      var bobK = Math.sin(now*0.004)*2;
      app.drawKey(ctx, app.key.x, app.key.y + bobK, 1);
      ctx.restore();
    }
    if(app.laser){
      ctx.save();
      var pulse = 3 + Math.sin(now*0.02)*1.2;
      ctx.shadowColor = 'rgba(255,40,80,0.95)'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#ff2a50';
      ctx.beginPath(); ctx.arc(app.laser.x, app.laser.y, pulse, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
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

  // Cat #2 trails the first one at a polite distance and never quite catches up.
  app.updateCat2 = function(c2, lead){
    c2.sq += (1 - c2.sq) * 0.18;
    var dx = lead.x - c2.x, dy = lead.y - c2.y, d = Math.hypot(dx, dy);
    var want = 46;
    if(d > want){
      var sp = Math.min(3.6, 0.9 + (d - want) * 0.02);
      c2.x += (dx/d)*sp; c2.y += (dy/d)*sp;
      if(Math.abs(dx) > 1.5) c2.facing = dx < 0 ? -1 : 1;
      c2.phase += 0.24 + sp*0.05;
    } else {
      c2.phase += 0.03;
    }
    c2.sleeping = lead.sleeping;
  };

  app.drawKey = function(ctx, x, y, a){
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(240,179,93,0.9)'; ctx.shadowBlur = 12;
    ctx.strokeStyle = '#f0b35d'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x - 4, y, 3.6, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 0.6, y); ctx.lineTo(x + 8, y);
    ctx.moveTo(x + 8, y); ctx.lineTo(x + 8, y + 3.4);
    ctx.moveTo(x + 5, y); ctx.lineTo(x + 5, y + 2.6);
    ctx.stroke();
    ctx.restore();
  };

  app.drawCat = function(ctx, cat, time, rage){
    rage = rage || 0;
    var walk = (cat.pause > 0 || cat.held) ? 0 : Math.sin(cat.phase);
    var tail = Math.sin(time*0.005);
    var z = cat.z || 0;
    var sq = cat.sq === undefined ? 1 : cat.sq;

    // contact shadow — shrinks and fades as the cat gets airborne
    ctx.save();
    var sh = Math.max(0, 1 - z/130);
    ctx.globalAlpha = 0.34 * sh;
    ctx.fillStyle = '#000';
    ctx.filter = 'blur(2px)';
    ctx.beginPath();
    ctx.ellipse(cat.x, cat.y + 14, 15*sh + 3, 4*sh + 1.2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    var bob = rage > 0 ? Math.abs(Math.sin(time*0.004)) * 7 * rage : 0;
    var grow = 1 + rage*0.75 + (rage > 0 ? Math.sin(time*0.006)*0.06*rage : 0);
    ctx.translate(cat.x, cat.y - bob - z);
    // squash and stretch: wide+flat on landing, tall+thin on takeoff
    ctx.scale(cat.facing * grow * (2 - sq), grow * sq);
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
    if(cat.sleeping) blink = 1;                                // eyes shut
    if(cat.purr > time) blink = 0.72;                          // happy squint
    if(cat.acc === 'shades') blink = 0;                        // eyes hidden anyway
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

    // ---- accessory ----
    if(cat.acc){
      ctx.shadowBlur = 0;
      var ax = hx, ay = hy - 10.5;
      if(cat.acc === 'hat'){
        ctx.fillStyle = '#6d28d9';
        ctx.beginPath(); ctx.ellipse(ax, ay, 10, 2.6, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(ax-5.5, ay); ctx.lineTo(ax-3.5, ay-6.5);
        ctx.lineTo(ax+3.5, ay-6.5); ctx.lineTo(ax+5.5, ay); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#a855f7';
        ctx.fillRect(ax-5.4, ay-2.4, 10.8, 1.8);
      } else if(cat.acc === 'crown'){
        ctx.fillStyle = '#f0b35d';
        ctx.beginPath();
        ctx.moveTo(ax-7, ay+1); ctx.lineTo(ax-7, ay-4); ctx.lineTo(ax-3.5, ay-1.2);
        ctx.lineTo(ax, ay-6); ctx.lineTo(ax+3.5, ay-1.2); ctx.lineTo(ax+7, ay-4);
        ctx.lineTo(ax+7, ay+1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff2ea6';
        ctx.beginPath(); ctx.arc(ax, ay-2.2, 1.1, 0, Math.PI*2); ctx.fill();
      } else if(cat.acc === 'santa'){
        ctx.fillStyle = '#d92b3a';
        ctx.beginPath(); ctx.moveTo(ax-6.5, ay+1); ctx.quadraticCurveTo(ax-1, ay-11, ax+7, ay-7);
        ctx.quadraticCurveTo(ax+2, ay-2, ax+6.5, ay+1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(ax, ay+1.2, 7.2, 2.1, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ax+7.4, ay-7, 2.1, 0, Math.PI*2); ctx.fill();
      } else if(cat.acc === 'pumpkin'){
        ctx.fillStyle = '#e8791f';
        ctx.beginPath(); ctx.ellipse(ax, ay-2, 5.6, 4.6, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#7a3a06'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ax, ay-6.4); ctx.lineTo(ax, ay-8.4); ctx.stroke();
        ctx.fillStyle = '#3a1a02';
        ctx.beginPath(); ctx.moveTo(ax-2.6, ay-3); ctx.lineTo(ax-1, ay-1.4); ctx.lineTo(ax-3.4, ay-1.4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(ax+2.6, ay-3); ctx.lineTo(ax+3.4, ay-1.4); ctx.lineTo(ax+1, ay-1.4); ctx.closePath(); ctx.fill();
      }
    }
    if(cat.acc === 'shades'){
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#14101f';
      ctx.fillRect(hx-8.4, hy-2.4, 7, 4.2);
      ctx.fillRect(hx+1.4, hy-2.4, 7, 4.2);
      ctx.strokeStyle = '#14101f'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(hx-1.4, hy-0.6); ctx.lineTo(hx+1.4, hy-0.6); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(hx-7.6, hy-1.8, 2, 1.2);
      ctx.fillRect(hx+2.2, hy-1.8, 2, 1.2);
    }

    // ---- carried licence key ----
    if(cat.carry === 'key'){
      ctx.shadowBlur = 0;
      ctx.save(); ctx.scale(1/(2-sq), 1/sq);
      app.drawKey(ctx, hx + 6, hy + 7, 1);
      ctx.restore();
    }

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
      sq: 1, z: 0, vx: 0, vy: 0, carry: null, sleeping: false, acc: null,
    };
    app.save = app.loadSave();
    app.cat.acc = app.accessory();
    app.nextKey = performance.now() + 30000 + Math.random()*30000;

    // a second cat turns up once you've properly befriended the first
    if(app.save.pets >= 50){
      app.cat2 = { x: -60, y: window.innerHeight*0.6, facing: 1, phase: 0,
                   pause: 0, held: false, purr: 0, sq: 1, z: 0, acc: null, sleeping: false };
    }

    // hovering a call-to-action makes the cat go and look at it
    document.addEventListener('pointerover', function(e){
      var t = e.target && e.target.closest && e.target.closest('.btn-primary,.dc,.np-cta a');
      if(!t) return;
      var st = app.state;
      if(st === 'chase' || st === 'zoom' || st === 'thrown' || st === 'jump' || app.drag) return;
      if(performance.now() < app.ctaUntil) return;
      var r = t.getBoundingClientRect();
      if(r.top < 40 || r.top > window.innerHeight - 40) return;
      app.releasePerch();
      app.ctaUntil = performance.now() + 4200;
      app.jumpTo(app.cat, r.left + r.width*0.5 + (Math.random()<0.5?-1:1)*(r.width*0.5+22), r.top - 13);
      app.prevState = 'cta';
    });
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
        if(app.cat2){ app.updateCat2(app.cat2, cat); app.drawCat(catCtx, app.cat2, performance.now(), 0); }
        app.drawCat(catCtx, cat, performance.now(), rageF);
      } else {
        app.drawExtras(ctx, now);
        if(app.cat2){ app.updateCat2(app.cat2, cat); app.drawCat(ctx, app.cat2, performance.now(), 0); }
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
