import sharp from 'sharp';
await sharp('public/social.svg').png().toFile('public/social.png');
console.log('Created public/social.png (1200 × 630).');
