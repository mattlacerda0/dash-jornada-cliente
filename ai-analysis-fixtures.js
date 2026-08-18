/**
 * Fixtures da Análise com IA — somente desenvolvimento local.
 * Uso: http://localhost:4173/?aiFixture=complete
 * Estados visuais: loading | complete | rate_limited | generic_error | ai_not_configured | unsupported
 * loading, unsupported e network são tratados no JS (não precisam deste pack).
 * Não ativa em produção. Não chama Gemini quando aiFixture está definido em localhost.
 */
window.AI_ANALYSIS_FIXTURES = {
  complete: {
    success: true,
    page: "meetings",
    title: "Reuniões",
    generated_at: "2026-08-18T11:00:00.000Z",
    analysis_context: {
      kpis: [
        { metric: "attendance_rate", label: "Taxa de comparecimento", value: 85.4, unit: "percent" },
        { metric: "no_show_rate", label: "Taxa de no-show", value: 14.6, unit: "percent" },
        { metric: "meetings_completed_by_month", label: "Reuniões realizadas no mês", value: 40, unit: "meetings" }
      ]
    },
    executive_analysis: {
      headline: "Queda relevante nas reuniões realizadas no mês, com comparecimento ainda elevado neste recorte.",
      executive_summary: "As reuniões realizadas recuaram frente ao mês anterior. O comparecimento permanece alto entre as reuniões classificadas. A cobertura de alguns indicadores é baixa e não deve ser generalizada à carteira inteira.",
      scope: { type: "active_clients", label: "Clientes ativos", count: 1816, source: "page_default" },
      highlight_numbers: [
        { metric: "active_clients", label: "Clientes ativos", value: 1816, unit: "clients" },
        { metric: "attendance_rate", label: "Comparecimento", value: 85.4, unit: "percent" }
      ],
      attention_points: [
        {
          severity: "critical",
          title: "Queda nas reuniões realizadas",
          description: "O volume de reuniões realizadas no mês mais recente ficou claramente abaixo do mês anterior e merece investigação operacional.",
          evidence: [{ metric: "meetings_completed_by_month", value: 40, unit: "meetings" }]
        },
        {
          severity: "attention",
          title: "No-show em alta",
          description: "A taxa de no-show aumentou neste recorte e deve ser lida junto da cobertura da métrica.",
          evidence: [{ metric: "no_show_rate", value: 14.6, unit: "percent" }]
        }
      ],
      positive_signals: [
        {
          title: "Comparecimento elevado",
          description: "A taxa de comparecimento permanece em patamar alto entre as reuniões elegíveis deste recorte.",
          evidence: [{ metric: "attendance_rate", value: 85.4, unit: "percent" }]
        }
      ],
      recommended_actions: [
        {
          title: "Investigar a queda mensal de realizadas",
          description: "Cruzar agenda, tipos de reunião e recorte temporal para entender o recuo, sem assumir que menos reuniões produzam cancelamento.",
          based_on: ["meetings_completed_by_month"]
        }
      ],
      limitations: [
        { title: "Cobertura baixa", description: "Parte dos indicadores de presença usa cobertura reduzida e vale para a amostra classificada." },
        { title: "Leitura do recorte", description: "A comparação mensal descreve variação observada, não uma meta de negócio." }
      ]
    },
    metadata: { ai_generated: true, generated_at: "2026-08-18T11:00:00.000Z" }
  },
  attention_only: {
    success: true,
    page: "general",
    title: "Dados Gerais",
    generated_at: "2026-08-18T11:00:00.000Z",
    analysis_context: {
      kpis: [
        { metric: "cancelled_without_confirmed_date", label: "Cancelados sem data confirmada", value: 811, unit: "clients" }
      ]
    },
    executive_analysis: {
      headline: "Há um volume relevante de cancelamentos sem data confirmada neste recorte.",
      executive_summary: "A carteira permanece majoritariamente ativa, mas 811 clientes estão marcados como cancelados sem confirmação de data. Não há sinal positivo adicional neste recorte.",
      attention_points: [
        {
          severity: "attention",
          title: "Cancelamentos sem data confirmada",
          description: "Há 811 clientes nessa situação e o número precisa ser investigado operacionalmente.",
          evidence: [{ metric: "cancelled_without_confirmed_date", value: 811, unit: "clients" }]
        }
      ],
      positive_signals: [],
      recommended_actions: [
        {
          title: "Investigar o registro de datas",
          description: "Avaliar a qualidade do registro de data nos casos sem confirmação.",
          based_on: ["cancelled_without_confirmed_date"]
        }
      ],
      limitations: [
        { title: "Dado cadastral", description: "O indicador descreve ausência de data confirmada, não o motivo do cancelamento." }
      ]
    },
    metadata: { ai_generated: true, generated_at: "2026-08-18T11:00:00.000Z" }
  },
  no_actions: {
    success: true,
    page: "statistical-crosses",
    title: "Análises Estatísticas",
    generated_at: "2026-08-18T11:00:00.000Z",
    analysis_context: {
      kpis: [
        { metric: "sc_nps", label: "NPS nos cruzamentos", value: 64.8, unit: "index" },
        { metric: "daysToFirstMeeting", label: "Dias até a primeira reunião", value: 0.4868, unit: "association" }
      ]
    },
    executive_analysis: {
      headline: "O tempo até a primeira reunião está associado ao cancelamento neste recorte.",
      executive_summary: "Há relação observada entre dias até a primeira reunião e cancelamento. A AUC descreve capacidade de discriminação, não taxa de acerto. A cobertura do NPS é baixa e limita a generalização. Não há ação adicional além de reconhecer essas limitações.",
      attention_points: [
        {
          severity: "attention",
          title: "Associação observada",
          description: "Dias até a primeira reunião está associado ao cancelamento no recorte. Isso não implica que o atraso produza a saída.",
          evidence: [
            { metric: "daysToFirstMeeting", value: 0.4868, unit: "association" },
            { metric: "sc_nps", value: 64.8, unit: "index" }
          ]
        }
      ],
      positive_signals: [],
      recommended_actions: [],
      limitations: [
        { title: "Cobertura do NPS", description: "Cobertura de 12% — o resultado vale para respondentes, não para toda a carteira." },
        { title: "Amostra estatística", description: "Diferenças entre grupos descrevem o recorte observado, sem relação de causa." }
      ]
    },
    metadata: { ai_generated: true, generated_at: "2026-08-18T11:00:00.000Z" }
  },
  rate_limited: {
    success: false,
    code: "ai_generation_failed",
    reason: "rate_limited",
    error: "Não foi possível gerar a análise executiva."
  },
  generic_error: {
    success: false,
    code: "ai_generation_failed",
    reason: null,
    error: "Não foi possível gerar a análise executiva."
  },
  ai_not_configured: {
    success: false,
    code: "ai_not_configured",
    error: "Análise com IA ainda não está configurada neste ambiente."
  }
};
