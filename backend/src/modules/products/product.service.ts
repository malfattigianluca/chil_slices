import prisma from '../../prisma';

export async function getByList(listId: number, search?: string) {
  return prisma.product.findMany({
    where: {
      listaPrecioId: listId,
      ...(search ? {
        OR: [
          { codigo: { contains: search } },
          { descripcion: { contains: search } },
        ],
      } : {}),
    },
    orderBy: { codigo: 'asc' },
  });
}

export async function getById(id: number) {
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p) throw Object.assign(new Error('Producto no encontrado'), { status: 404 });
  return p;
}

export async function update(id: number, data: {
  descripcion?: string;
  precioUnidad?: number;
  precioBulto?: number | null;
  ivaPorcentaje?: number;
  activo?: boolean;
}) {
  return prisma.product.update({ where: { id }, data });
}

export async function create(data: {
  codigo: string;
  descripcion: string;
  precioUnidad: number;
  precioBulto?: number | null;
  ivaPorcentaje?: number;
  listaPrecioId: number;
}) {
  return prisma.product.create({ data: { ivaPorcentaje: 21, ...data } });
}

export async function remove(id: number) {
  return prisma.product.update({ where: { id }, data: { activo: false } });
}
