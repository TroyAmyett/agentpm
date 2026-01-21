-- Create blog-images storage bucket for agent-generated images

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-images',
  'blog-images',
  true,  -- Public bucket for blog hero images
  5242880,  -- 5MB limit
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Public read access for blog images" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload blog images" ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage blog images" ON storage.objects;

-- Allow public read access to blog images
CREATE POLICY "Public read access for blog images"
ON storage.objects FOR SELECT
USING (bucket_id = 'blog-images');

-- Allow service role to upload images
CREATE POLICY "Service role can upload blog images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'blog-images'
  AND auth.role() = 'service_role'
);

-- Allow service role to update/delete images
CREATE POLICY "Service role can manage blog images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'blog-images'
  AND auth.role() = 'service_role'
);
