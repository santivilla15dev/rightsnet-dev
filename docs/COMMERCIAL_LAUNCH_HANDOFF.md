# Expediente de lanzamiento comercial — RightsNet

Actualizado: 2026-09-11. Preparación, no dictamen jurídico ni autorización live.
**Hecho confirmado por el fundador:** todavía no existe empresa/actividad registrada
para RightsNet. País de establecimiento, forma de actividad y asesoría pendientes.
No publicar una entidad, dirección, contacto o número fiscal ficticios.

## Propuesta de negocio a validar

Un piloto asistido con agencias y marcas que necesitan usar la imagen de creadores
adultos reales en anuncios IA. Un solo tipo de activo y un alcance territorial
inicial revisado. Diferenciación a medir: tiempo para resolver permisos, claridad
de bloqueos, repetición de compra y evidencia compartible por campaña.

Hipótesis inicial: comisión transparente por licencia, mostrando coste total antes
de aceptar. La cuantía, quién factura a quién y el tratamiento fiscal se deciden
con el operador y asesoría; este documento no altera las tarifas existentes.
Primero entrevistar compradores y probar el recorrido con datos de demostración.
Después, una campaña pagada controlada tras cerrar gates. Medir margen después de
pagos, identidad, soporte y revisión, además de volumen y repetición.
No hay prueba todavía de disposición a pagar ni de superioridad competitiva.

## Decisiones y entregas requeridas

| Área | Decisión/evidencia que permite cerrar | Responsable | Estado |
|---|---|---|---|
| Operador | País, actividad individual o sociedad, registro aplicable, nombre, dirección y contacto efectivos | Fundador + asesoría | OPEN; no existe aún |
| Modelo contractual | Papel de plataforma, creador y comprador; alcance de intermediación y flujo de fondos | Jurídico | OPEN |
| Licencia | Plantilla aprobada y versionada para publicidad con likeness; usos, canales, duración, territorios, remuneración, revisión, terminación y conflictos | Jurídico | OPEN |
| Consentimientos | Separar permiso de imagen, contrato y bases de tratamiento de datos; cambios y retirada según cada supuesto | Jurídico/privacidad | OPEN |
| Identidad/adultez | Evidencia y proceso operativo de titularidad, mayoría de edad, rechazo y revisión manual | Operaciones + jurídico | OPEN |
| Información web | Aviso del operador/Impressum y términos según establecimiento y destinatarios | Fundador + jurídico | OPEN |
| Privacidad | Inventario, finalidades, bases, destinatarios, plazos, transferencias y canal real para derechos | Privacidad | OPEN |
| Riesgos de datos | Evaluar si procede DPIA y condiciones adicionales para identificación biométrica; documentar conclusión | Privacidad | OPEN |
| Proveedores | Contratos/DPA, roles de Stripe/Supabase/storage/generación, localización y transferencias verificadas | Operaciones + privacidad | OPEN |
| Cookies | Inventario real del despliegue y clasificación; consentimiento previo cuando corresponda antes de añadir seguimiento opcional | Web + privacidad | OPEN |
| Fiscalidad | IVA, facturación, fee, facturas/abonos y obligaciones de plataforma aplicables según modelo | Fiscal | OPEN |
| Anuncios IA | Matriz de responsabilidad de proveedor, plataforma y anunciante; identificación de contenido IA y derechos de terceros | Jurídico + producto | OPEN |
| Incidencias | Contacto, recepción, revisión, respuesta y conservación de evidencia; sin retirada global prometida | Operaciones + jurídico | OPEN |
| Seguridad operativa | Staging, aislamiento real de organizaciones, storage/scan, alertas, restauración y gestión de claves probados | Ingeniería | OPEN; componentes locales PASS |
| Autorización comercial | Expediente anterior aprobado con responsable, fecha, versión y evidencia; ensayo de cobro/payout | Fundador + asesoría + operaciones | OPEN |

## Inventario técnico preliminar para privacidad

- Cuenta y organización; sesiones de autenticación.
- Perfil, referencias de imagen, reglas, licencias, acuerdos existentes y outputs.
- Identificadores/estados de proveedores de identidad y pagos, y eventos de auditoría.
- Cookies `rightsnet_session` y `rightsnet_refresh` en el proxy web.
- La búsqueda de código web no encontró gtag, pixel ni PostHog. Esto no sustituye
  inspeccionar cookies y peticiones en el despliegue final, incluidos proveedores.
- La política pública actual es provisional: no basta añadir un banner de cookies.
- Preparar procedimientos ejecutables de acceso, corrección, supresión/limitación
  y conservación justificada. No borrar automáticamente historial contractual o
  financiero sin resolver obligaciones y alcance con asesoría.

## Fuentes oficiales consultadas el 11-09-2026

- EDPB, bases de tratamiento: https://www.edpb.europa.eu/topics/key-gdpr-concepts/legal-basis_en
- EDPB, protección de datos desde el diseño y cumplimiento: https://www.edpb.europa.eu/sme/be-compliant/be-compliant_en
- Austria USP, información del operador/Impressum: https://www.usp.gv.at/themen/brancheninformationen/information-und-kommunikation/impressumspflicht-gemaess-para-24-mediengesetz.html
- Comisión Europea, transparencia de sistemas IA: https://digital-strategy.ec.europa.eu/en/factpages/quick-facts-transparency-rules-ai-systems

Estas fuentes orientan las preguntas. La aplicación concreta depende del operador,
tratamiento, servicios, roles y países. No se afirma conformidad con todos los
requisitos por completar una checklist técnica. Ver `launch-gates.md`.

## Orden de próximos hitos

1. Transparencia pública y este expediente (COMMERCIAL_TRUST_V0_1).
2. Decidir operador/modelo y obtener documentos aprobados; puede avanzarse con
   preparación técnica en paralelo, sin recopilar datos reales para un servicio abierto.
3. Implementar información legal y procedimientos de privacidad según decisiones,
   más verificación operativa de staging y seguridad.
4. Ensayo humano completo y aprobación del piloto; habilitación separada de live.
5. Primera transacción y payout reales; corregir fricción antes de ampliar verticales.
