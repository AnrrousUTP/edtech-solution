/** Reloj inyectable: el dominio recibe la hora, no la pide (doc 12 §3). */
export interface Reloj {
  ahora(): Date
}

export class RelojSistema implements Reloj {
  ahora(): Date {
    return new Date()
  }
}

export class FakeClock implements Reloj {
  constructor(private fecha: Date) {}

  ahora(): Date {
    return new Date(this.fecha)
  }

  fijar(fecha: Date): void {
    this.fecha = fecha
  }

  avanzarDias(dias: number): void {
    this.fecha = new Date(this.fecha.getTime() + dias * 24 * 60 * 60 * 1000)
  }

  avanzarHoras(horas: number): void {
    this.fecha = new Date(this.fecha.getTime() + horas * 60 * 60 * 1000)
  }
}
