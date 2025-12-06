import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';

export async function registerCategoryRoutes(app: FastifyInstance) {
  // List Categories
  app.get('/categories', async (request, reply) => {
    const categories = await prisma.category.findMany({
      include: {
        tags: true
      },
      orderBy: { created_at: 'desc' }
    });
    return categories;
  });

  // Create Category
  app.post<{ Body: { name: string } }>('/categories', async (request, reply) => {
    const { name } = request.body;
    if (!name) return reply.badRequest('Name is required');

    try {
      const category = await prisma.category.create({
        data: { name },
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
  app.put<{ Params: { id: string }, Body: { name: string } }>('/categories/:id', async (request, reply) => {
    const { id } = request.params;
    const { name } = request.body;
    
    try {
      const category = await prisma.category.update({
        where: { id },
        data: { name }
      });
      return category;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.notFound('Category not found');
      }
      throw error;
    }
  });

  // Delete Category
  app.delete<{ Params: { id: string } }>('/categories/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      await prisma.category.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.notFound('Category not found');
      }
      throw error;
    }
  });

  // Create Tag under Category
  app.post<{ Params: { id: string }, Body: { name: string } }>('/categories/:id/tags', async (request, reply) => {
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
      if (!category) return reply.notFound('Category not found');
      
      throw error;
    }
  });

  // Delete Tag
  app.delete<{ Params: { id: string } }>('/tags/:id', async (request, reply) => {
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
