import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { image } = req.body;
    const buffer = Buffer.from(
      image.replace(/^data:image\/png;base64,/, ''),
      'base64'
    );
    const filename = `kb4cut-${Date.now()}.png`;

    await s3.send(
      new PutObjectCommand({
        Bucket: 'kb-4cut',
        Key: filename,
        Body: buffer,
        ContentType: 'image/png',
      })
    );

    const base = process.env.CLOUDFRONT_URL || 'https://kb-4cut.s3.ap-northeast-2.amazonaws.com';
    const url = `${base}/${filename}`;
    res.status(200).json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
}
