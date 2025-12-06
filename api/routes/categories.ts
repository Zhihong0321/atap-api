import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';

const tagSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    category_id: { type: 'string', format: 'uuid' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'name', 'category_id', 'created_at', 'updated_at']
} as const;

const categorySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name_en: { type: 'string' },
    name_cn: { type: 'string' },
    name_my: { type: 'string' },
    description_en: { type: 'string', nullable: true },
    description_cn: { type: 'string', nullable: true },
    description_my: { type: 'string', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    tags: { type: 'array', items: tagSchema }
  },
  required: ['id', 'name_en', 'name_cn', 'name_my', 'created_at', 'updated_at', 'tags']
} as const;

export async function registerCategoryRoutes(app: FastifyInstance) {
  // List Categories
  app.get('/categories', {
    schema: {
      tags: ['Categories'],
      summary: 'List categories',
      response: {
        200: {
          type: 'array',
          items: categorySchema
        }
      }
    }
  }, async (request, reply) => {
    const categories = await prisma.category.findMany({
      include: {
        tags: true
      },
      orderBy: { created_at: 'desc' }
    });
    return categories;
  });

  // Create Category
  app.post<{ Body: { 
    name_en: string; 
    name_cn: string; 
    name_my: string;
    description_en?: string;
    description_cn?: string;
    description_my?: string;
  } }>('/categories', {
    schema: {
      tags: ['Categories'],
      summary: 'Create category',
      body: {
        type: 'object',
        required: ['name_en', 'name_cn', 'name_my'],
        properties: {
          name_en: { type: 'string' },
          name_cn: { type: 'string' },
          name_my: { type: 'string' },
          description_en: { type: 'string' },
          description_cn: { type: 'string' },
          description_my: { type: 'string' }
        }
      },
      response: {
        201: categorySchema,
        409: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message']
        }
      }
    }
  }, async (request, reply) => {
    const { name_en, name_cn, name_my, description_en, description_cn, description_my } = request.body;
    
    if (!name_en || !name_cn || !name_my) {
      return reply.badRequest('All language names are required');
    }

    try {
      const category = await prisma.category.create({
        data: { 
          name_en, 
          name_cn, 
          name_my,
          description_en,
          description_cn,
          description_my
        },
        include: { tags: true }
      });
      return category;
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.conflict('Category already exists');
      }
      throw error;
    }
  });

  // Update Category
  app.put<{ Params: { id: string }, Body: { 
    name_en?: string; 
    name_cn?: string; 
    name_my?: string;
    description_en?: string;
    description_cn?: string;
    description_my?: string;
  } }>('/categories/:id', {
    schema: {
      tags: ['Categories'],
      summary: 'Update category',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      body: {
        type: 'object',
        properties: {
          name_en: { type: 'string' },
          name_cn: { type: 'string' },
          name_my: { type: 'string' },
          description_en: { type: 'string' },
          description_cn: { type: 'string' },
          description_my: { type: 'string' }
        }
      },
      response: {
        200: categorySchema,
        404: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message']
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { name_en, name_cn, name_my, description_en, description_cn, description_my } = request.body;
    
    const updateData: any = {};
    if (name_en !== undefined) updateData.name_en = name_en;
    if (name_cn !== undefined) updateData.name_cn = name_cn;
    if (name_my !== undefined) updateData.name_my = name_my;
    if (description_en !== undefined) updateData.description_en = description_en;
    if (description_cn !== undefined) updateData.description_cn = description_cn;
    if (description_my !== undefined) updateData.description_my = description_my;
    
    try {
      const category = await prisma.category.update({
        where: { id },
        data: updateData
      });
      return category;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.code(404).send({ message: 'Category not found' });
      }
      throw error;
    }
  });

  // Delete Category
  app.delete<{ Params: { id: string } }>('/categories/:id', {
    schema: {
      tags: ['Categories'],
      summary: 'Delete category',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' } },
          required: ['success']
        },
        404: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message']
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    try {
      await prisma.category.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.code(404).send({ message: 'Category not found' });
      }
      throw error;
    }
  });

  // Create Tag under Category
  app.post<{ Params: { id: string }, Body: { name: string } }>('/categories/:id/tags', {
    schema: {
      tags: ['Categories'],
      summary: 'Create tag for category',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } }
      },
      response: {
        200: tagSchema,
        404: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message']
        },
        409: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message']
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { name } = request.body;
    
    if (!name) return reply.badRequest('Tag name is required');

    try {
      const tag = await prisma.tag.create({
        data: {
          name,
          category_id: id
        }
      });
      return tag;
    } catch (error: any) {
      if (error.code === 'P2002') {
         return reply.conflict('Tag already exists in this category');
      }
      // Check if category exists
      const category = await prisma.category.findUnique({ where: { id } });
      if (!category) return reply.code(404).send({ message: 'Category not found' });
      
      throw error;
    }
  });

  // Delete Tag
  app.delete<{ Params: { id: string } }>('/tags/:id', {
    schema: {
      tags: ['Categories'],
      summary: 'Delete tag',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' } },
          required: ['success']
        },
        404: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message']
        }
      }
    }
  }, async (request, reply) => {
     const { id } = request.params;
     try {
       await prisma.tag.delete({ where: { id } });
       return { success: true };
     } catch (error: any) {
       if (error.code === 'P2025') {
         return reply.notFound('Tag not found');
       }
       throw error;
     }
  });
}
