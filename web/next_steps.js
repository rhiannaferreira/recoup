// "What happens next" for each kind of action, in plain steps.
// Keep these factual and general; the receipt carries the exact rule and source.

export const NEXT_STEPS = {
  en: {
    federal_dispute: [
      "Start the dispute before the deadline on the Rights Clock. Keep your Good Faith Estimate and the bill handy.",
      "Pay the $25 fee. You may get it back if the decision goes your way.",
      "While the dispute is open, the provider can't send this bill to collections or add late fees.",
      "An independent reviewer decides a price between the estimate and the bill, usually within about 30 business days of getting everything.",
    ],
    aid_application: [
      "Send the request letter and ask for the hospital's application and policy.",
      "Fill in the application with proof of income (pay stubs, tax return or benefit letters).",
      "Ask the hospital to pause collections while it reviews your application.",
      "If you're approved and already paid, ask for a refund of what you paid above the new balance.",
      "If the hospital ignores you or hides its policy, you can report a nonprofit hospital to the IRS on Form 13909.",
    ],
    demand_letter: [
      "Send the letter in a way you can prove, like email plus certified mail. Keep a copy.",
      "The landlord has 14 days to refund. After that, 18% yearly interest is added.",
      "Mark it as Sent here so Recoup can show the 14-day date.",
      "If there's still no refund, you can file a complaint with the Colorado Attorney General or go to small claims court.",
    ],
    insurer_appeal: [
      "Ask your doctor's office for a letter explaining why you needed the care.",
      "Send the appeal before the deadline, with the letter and a copy of the insurance statement.",
      "The insurer usually has 30 days to decide on care you haven't had yet, and 60 days on care you already got.",
      "If they say no again, ask for an independent external review within 4 months.",
    ],
    letter: [
      "Ask for an itemized bill if you don't have one.",
      "Send the letter and keep a copy. Ask them to hold collections while they review it.",
      "Mark it as Sent here. Follow up if you haven't heard back in 30 days.",
    ],
  },
  es: {
    federal_dispute: [
      "Inicie la disputa antes del plazo del Reloj de derechos. Tenga a mano su estimado de buena fe y la factura.",
      "Pague la tarifa de $25. Puede recuperarla si la decisión le favorece.",
      "Mientras la disputa esté abierta, el proveedor no puede enviar la factura a cobranza ni agregar recargos.",
      "Un revisor independiente decide un precio entre el estimado y la factura, normalmente en unos 30 días hábiles después de recibir todo.",
    ],
    aid_application: [
      "Envíe la carta y pida la solicitud y la política del hospital.",
      "Llene la solicitud con prueba de ingresos (talones de pago, declaración de impuestos o cartas de beneficios).",
      "Pida al hospital que pause la cobranza mientras revisa su solicitud.",
      "Si la aprueban y ya pagó, pida que le reembolsen lo que pagó por encima del nuevo saldo.",
      "Si el hospital no responde u oculta su política, puede reportar a un hospital sin fines de lucro ante el IRS con el Formulario 13909.",
    ],
    demand_letter: [
      "Envíe la carta de una forma que pueda comprobar, como correo electrónico y correo certificado. Guarde una copia.",
      "El arrendador tiene 14 días para reembolsar. Después se suma 18% de interés anual.",
      "Márquela como Enviado aquí para que Recoup muestre la fecha de los 14 días.",
      "Si aún no hay reembolso, puede presentar una queja ante el Fiscal General de Colorado o ir a la corte de reclamos menores.",
    ],
    insurer_appeal: [
      "Pida al consultorio de su médico una carta que explique por qué necesitaba la atención.",
      "Envíe la apelación antes del plazo, con la carta y una copia del estado de cuenta del seguro.",
      "La aseguradora suele tener 30 días para decidir sobre atención que aún no recibe, y 60 días sobre atención ya recibida.",
      "Si vuelven a negarla, pida una revisión externa independiente dentro de 4 meses.",
    ],
    letter: [
      "Pida una factura detallada si no la tiene.",
      "Envíe la carta y guarde una copia. Pida que detengan la cobranza mientras la revisan.",
      "Márquela como Enviado aquí. Dé seguimiento si no le responden en 30 días.",
    ],
  },
};
