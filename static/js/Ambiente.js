class Perception {
    constructor(A, B, C, D) {
        this.A = A;
        this.B = B;
        this.C = C;
        this.D = D;
    }

    // Función para calcular la percepción
    calcularPercepcion() {
        let estado = (4 * 418.9829) - (
            ((this.A - 620.0) * Math.sin(Math.sqrt(Math.abs(this.A - 620.0)))) +
            ((this.B + 320.0) * Math.sin(Math.sqrt(Math.abs(this.B + 320.0)))) +
            ((this.C + 720.0) * Math.sin(Math.sqrt(Math.abs(this.C + 720.0)))) +
            ((this.D - 820.0) * Math.sin(Math.sqrt(Math.abs(this.D - 820.0))))
        );
        return estado;
    }
}

export default Perception;
