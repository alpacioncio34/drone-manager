export type Entrada = {
  id: string;
  nombre: string;
};

export async function getEntradas(): Promise<Entrada[]> {
  return [
    { id: '1', nombre: 'Dron 1' },
    { id: '2', nombre: 'Dron 2' },
    { id: '3', nombre: 'Dron 3' },
  ];
}
