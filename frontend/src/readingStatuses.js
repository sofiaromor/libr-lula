export const READING_STATUSES = [
  { value: "planned", label: "Pendiente", description: "Quiero leerlo" },
  { value: "reading", label: "Leyendo", description: "Lo estoy leyendo" },
  { value: "paused", label: "Pausado", description: "Lo retomaré más adelante" },
  { value: "completed", label: "Leído", description: "Lectura terminada" },
  { value: "dropped", label: "Abandonado", description: "Lo he dejado" },
  { value: "rereading", label: "Releyendo", description: "Otra vuelta más" },
];

export const READING_STATUS_BY_VALUE = Object.fromEntries(
  READING_STATUSES.map((status) => [status.value, status]),
);
