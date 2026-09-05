'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ImageAudit = require('../src/lib/image-audit.js');

test('detects common image formats from content type', () => {
  assert.equal(ImageAudit.formatFromContentType('image/jpeg'), 'JPEG');
  assert.equal(ImageAudit.formatFromContentType('image/webp; charset=binary'), 'WebP');
  assert.equal(ImageAudit.formatFromContentType('image/avif'), 'AVIF');
  assert.equal(ImageAudit.formatFromContentType('image/svg+xml'), 'SVG');
});

test('falls back to image format from URL path', () => {
  assert.equal(ImageAudit.formatFromUrl('https://example.com/a/photo.PNG?width=400'), 'PNG');
  assert.equal(ImageAudit.formatFromUrl('https://example.com/a/photo.jpeg'), 'JPEG');
  assert.equal(ImageAudit.detectFormat({ contentType: '' }, 'https://example.com/a/image.webp'), 'WebP');
});

test('formats byte counts for UI', () => {
  assert.equal(ImageAudit.bytesLabel(0), '—');
  assert.equal(ImageAudit.bytesLabel(512), '512 B');
  assert.equal(ImageAudit.bytesLabel(1536), '1.5 KB');
  assert.equal(ImageAudit.bytesLabel(2 * 1024 * 1024), '2.00 MB');
});

test('estimates oversized image waste from pixel area', () => {
  const result = ImageAudit.estimateWaste({
    naturalWidth: 2000,
    naturalHeight: 2000,
    renderedWidth: 500,
    renderedHeight: 500,
  }, { sizeBytes: 400000 }, 1);
  assert.equal(result.known, true);
  assert.equal(result.pixelRatio, 16);
  assert.equal(result.estimatedNeededBytes, 25000);
  assert.equal(result.estimatedWasteBytes, 375000);
  assert.equal(result.oversized, true);
});

test('device pixel ratio increases the target pixel budget', () => {
  const result = ImageAudit.estimateWaste({
    naturalWidth: 2000,
    naturalHeight: 2000,
    renderedWidth: 500,
    renderedHeight: 500,
  }, { sizeBytes: 400000 }, 2);
  assert.equal(result.pixelRatio, 4);
  assert.equal(result.estimatedNeededBytes, 100000);
  assert.equal(result.estimatedWasteBytes, 300000);
});

test('unknown source dimensions do not invent waste savings', () => {
  const result = ImageAudit.estimateWaste({
    naturalWidth: 0,
    naturalHeight: 0,
    renderedWidth: 300,
    renderedHeight: 200,
  }, { sizeBytes: 120000 }, 1);
  assert.equal(result.known, false);
  assert.equal(result.estimatedWasteBytes, 0);
  assert.equal(result.estimatedNeededBytes, 120000);
});

test('network states distinguish OK, redirect, and broken responses', () => {
  assert.deepEqual(ImageAudit.networkState({ status: 200 }), { level: 'ok', label: 'HTTP 200' });
  assert.equal(ImageAudit.networkState({ status: 200, redirected: true }).level, 'warning');
  assert.equal(ImageAudit.networkState({ status: 404 }).level, 'critical');
  assert.equal(ImageAudit.networkState({ status: 0, error: 'timeout' }).label, 'timeout');
});

test('analysis maps network data to duplicate image URLs and ranks waste descending', () => {
  const images = [
    { src: 'https://example.com/a.jpg', naturalWidth: 2000, naturalHeight: 2000, renderedWidth: 500, renderedHeight: 500, transferSize: 0 },
    { src: 'https://example.com/b.png', naturalWidth: 800, naturalHeight: 800, renderedWidth: 700, renderedHeight: 700, transferSize: 0 },
    { src: 'https://example.com/a.jpg#fragment', naturalWidth: 1000, naturalHeight: 1000, renderedWidth: 500, renderedHeight: 500, transferSize: 0 },
  ];
  const network = [
    { requestedUrl: 'https://example.com/a.jpg', status: 200, contentType: 'image/jpeg', sizeBytes: 400000, sizeSource: 'content-length' },
    { requestedUrl: 'https://example.com/b.png', status: 404, contentType: 'image/png', sizeBytes: 0, sizeSource: '' },
  ];
  const result = ImageAudit.analyze(images, network, 1);
  assert.equal(result.rows[0].format, 'JPEG');
  assert.equal(result.rows[2].network.status, 200);
  assert.equal(result.counts.broken, 1);
  assert.equal(result.ranked[0].url, 'https://example.com/a.jpg');
  assert.ok(result.estimatedWasteBytes > 0);
});
