/* ============================================
   SEGELN LERNEN -- Animated Waves
   Subtle layered ocean waves for dark hero
   ============================================ */

(function() {
  'use strict';

  function initWaves() {
    var canvas = document.querySelector('.wave-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var width, height;
    var animId;
    var time = 0;

    function resize() {
      var parent = canvas.parentElement;
      width = canvas.width = parent.offsetWidth;
      height = canvas.height = 150;
    }

    function drawWave(yBase, amp, freq, speed, r, g, b, alpha) {
      ctx.beginPath();
      ctx.moveTo(0, height);

      for (var x = 0; x <= width; x += 2) {
        var y = yBase +
          Math.sin(x * freq + time * speed) * amp +
          Math.sin(x * freq * 0.6 + time * speed * 0.7 + 1.2) * amp * 0.4;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
      ctx.fill();
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);

      // Deep ocean layers -- subtle, moody
      drawWave(80, 10, 0.006, 0.3, 79, 192, 208, 0.06);
      drawWave(90, 8, 0.009, 0.5, 26, 95, 122, 0.08);
      drawWave(100, 6, 0.012, 0.7, 201, 169, 110, 0.04);
      drawWave(110, 5, 0.015, 0.9, 246, 241, 235, 0.06);

      time += 0.015;
      animId = requestAnimationFrame(animate);
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    resize();
    animate();

    var resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 100);
    });

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) cancelAnimationFrame(animId);
      else animate();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWaves);
  } else {
    initWaves();
  }
})();
