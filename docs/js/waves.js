/* ============================================
   SEGELN LERNEN -- Animated Wave Background
   Subtle canvas wave animation for hero sections
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
      width = canvas.parentElement.offsetWidth;
      height = canvas.height = 120;
      canvas.width = width;
    }

    function drawWave(yOffset, amplitude, frequency, speed, alpha) {
      ctx.beginPath();
      ctx.moveTo(0, height);

      for (var x = 0; x <= width; x += 3) {
        var y = yOffset +
          Math.sin(x * frequency + time * speed) * amplitude +
          Math.sin(x * frequency * 0.5 + time * speed * 1.3) * amplitude * 0.5;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')';
      ctx.fill();
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);

      // Three layered waves for depth
      drawWave(70, 12, 0.008, 0.6, 0.15);
      drawWave(80, 10, 0.012, 0.8, 0.2);
      drawWave(90, 8, 0.015, 1.0, 0.3);

      time += 0.02;
      animId = requestAnimationFrame(animate);
    }

    // Only animate if user prefers motion
    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    resize();
    animate();

    window.addEventListener('resize', function() {
      resize();
    });

    // Pause when not visible
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        cancelAnimationFrame(animId);
      } else {
        animate();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWaves);
  } else {
    initWaves();
  }
})();
