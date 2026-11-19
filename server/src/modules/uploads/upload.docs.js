/**
 * src/modules/uploads/upload.docs.js – OpenAPI description of the /uploads routes.
 * Merged into the full spec by src/docs/openapi.js. Keep it in sync with upload.routes.js.
 */
import { LIMITS } from '../../config/constants.js';
import { IMAGE_FOLDERS } from '../../config/cloudinary.js';

const json = (schema) => ({ content: { 'application/json': { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const err = (name) => ({ $ref: `#/components/responses/${name}` });
const secured = [{ bearerAuth: [] }];
const maxMb = LIMITS.MAX_IMAGE_BYTES / (1024 * 1024);

export default {
  tags: [
    {
      name: 'Uploads',
      description:
        'Admin image uploads to Cloudinary. Upload first, then send the returned { url, publicId } inside the product/category JSON.',
    },
  ],
  paths: {
    '/uploads/image': {
      post: {
        tags: ['Uploads'],
        summary: `Upload ONE image (admin). JPG, PNG or WEBP, at most ${maxMb} MB.`,
        security: secured,
        parameters: [
          {
            name: 'folder',
            in: 'query',
            required: false,
            description: 'Where to store it (default products)',
            schema: { type: 'string', enum: Object.keys(IMAGE_FOLDERS) },
          },
        ],
        // multipart/form-data: the way browsers send files. "binary" makes Swagger UI show a
        // file picker.
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['image'],
                properties: { image: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Image uploaded',
            ...json({
              type: 'object',
              properties: {
                success: { type: 'boolean', example: true },
                message: { type: 'string' },
                data: ref('Image'),
              },
            }),
          },
          400: {
            description: 'No file, wrong type, too big, wrong field name, or bad folder',
            ...json(ref('Error')),
          },
          401: err('Unauthorized'),
          403: err('Forbidden'),
          500: { description: 'Cloudinary is not configured', ...json(ref('Error')) },
          502: { description: 'Cloudinary failed', ...json(ref('Error')) },
        },
      },
      delete: {
        tags: ['Uploads'],
        summary: 'Delete an uploaded image that was never saved (admin)',
        security: secured,
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['publicId'],
            properties: { publicId: { type: 'string', example: 'shopease/products/abc123' } },
          }),
        },
        responses: {
          200: {
            description: 'Image deleted ({ deleted: false } when Cloudinary is off or failed)',
            ...json({
              type: 'object',
              properties: {
                success: { type: 'boolean', example: true },
                message: { type: 'string' },
                data: { type: 'object', properties: { deleted: { type: 'boolean' } } },
              },
            }),
          },
          400: err('BadRequest'),
          401: err('Unauthorized'),
          403: err('Forbidden'),
        },
      },
    },
  },
};
