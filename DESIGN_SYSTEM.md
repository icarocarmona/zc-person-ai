# Design System — Cursor-Inspired

> **IMPORTANTE:** Este arquivo é referência obrigatória para qualquer trabalho de frontend.  
> Sempre consulte e aplique estas diretrizes ao criar ou modificar componentes, páginas ou estilos.

---

## 1. Visual Theme & Atmosfera

Sistema baseado em **warm minimalism meets code-editor elegance**.

- Canvas: warm off-white (`#f2f1ed`) — não branco puro, mas creme quente
- Texto primário: `#26251e` — quase-preto com subtom amarelo-marrom (evoca tinta e papel)
- Backgrounds secundários: `#e6e5e0`, `#ebeae5`
- Bordas: `oklab()` color space para tratamento perceptualmente uniforme
- Erro: `#cf2d56` — carmim quente, não vermelho clínico
- Resultado geral: premium print publication, não tech genérico

---

## 2. Paleta de Cores

### Primárias
| Token | Valor | Uso |
|-------|-------|-----|
| Cursor Dark | `#26251e` | Texto, headings, superfícies escuras |
| Cursor Cream | `#f2f1ed` | Background de página, superfície primária |
| Cursor Light | `#e6e5e0` | Superfície secundária, cards, botões |
| White | `#ffffff` | Elementos de máximo contraste (uso esparso) |

### Acento
| Token | Valor | Uso |
|-------|-------|-----|
| Cursor Orange | `#f54e00` | CTAs primários, links ativos, momentos de marca |
| Gold | `#c08532` | Destaques premium, contextos secundários |

### Semânticas
| Token | Valor | Uso |
|-------|-------|-----|
| Error | `#cf2d56` | Erros, hover de botões (signature interaction) |
| Success | `#1f8a65` | Sucesso, confirmações |

### Escala de Superfície
| Token | Valor | Uso |
|-------|-------|-----|
| Surface 100 | `#f7f7f4` | Botão/card mais claro |
| Surface 200 | `#f2f1ed` | Background de página |
| Surface 300 | `#ebeae5` | Background de botão padrão |
| Surface 400 | `#e6e5e0` | Backgrounds de cards |
| Surface 500 | `#e1e0db` | Botão terciário, ênfase maior |

### Bordas
| Token | Valor | Uso |
|-------|-------|-----|
| Border Primary | `oklab(0.263084 -0.00230259 0.0124794 / 0.1)` | Borda padrão (10% warm brown) |
| Border Medium | `oklab(0.263084 -0.00230259 0.0124794 / 0.2)` | Borda enfatizada (20%) |
| Border Strong | `rgba(38, 37, 30, 0.55)` | Bordas fortes, separadores de tabela |
| Border Solid | `#26251e` | Máximo contraste |
| Fallback CSS | `rgba(38, 37, 30, 0.1)` | Alternativa ao oklab para compatibilidade |

### Sombras
```css
/* Card elevado */
box-shadow: rgba(0,0,0,0.14) 0px 28px 70px,
            rgba(0,0,0,0.1) 0px 14px 32px,
            oklab(0.263084 -0.00230259 0.0124794 / 0.1) 0px 0px 0px 1px;

/* Ambient float */
box-shadow: rgba(0,0,0,0.02) 0px 0px 16px,
            rgba(0,0,0,0.008) 0px 0px 8px;

/* Focus */
box-shadow: rgba(0,0,0,0.1) 0px 4px 12px;
```

---

## 3. Tipografia

### Famílias de Fonte

As fontes originais do Cursor (CursorGothic, jjannon, berkeleyMono) são proprietárias.
**Este projeto usa alternativas open-source via Google Fonts**, que preservam o caráter visual:

```html
<!-- Adicionar no <head> do index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

| Voz | Original | **Alternativa Google Fonts** | Fallbacks |
|-----|---------|------------------------------|-----------|
| Display/UI/Headlines | `CursorGothic` | **`Inter`** (weight 400, letter-spacing negativo) | `system-ui, Helvetica Neue, Arial` |
| Body/Editorial | `jjannon` | **`Lora`** (serif com caráter, ital support) | `Iowan Old Style, ui-serif, Georgia` |
| Code/Technical | `berkeleyMono` | **`JetBrains Mono`** (refined coding font) | `ui-monospace, SFMono-Regular, Menlo, Consolas` |

```css
--font:       'Inter', system-ui, -apple-system, sans-serif;
--font-serif: 'Lora', 'Iowan Old Style', Georgia, ui-serif, serif;
--font-mono:  'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
```

**Letter-spacing do Inter** (emula a compressão do CursorGothic):
- 36px → `-0.045em` | 26px → `-0.02em` | 22px → `-0.007em` | ≤16px → `normal`

### Hierarquia
| Role | Fonte | Tamanho | Weight | Line-height | Letter-spacing |
|------|-------|---------|--------|-------------|----------------|
| Display Hero | CursorGothic | 72px | 400 | 1.10 | **-2.16px** |
| Section Heading | CursorGothic | 36px | 400 | 1.20 | **-0.72px** |
| Sub-heading | CursorGothic | 26px | 400 | 1.25 | -0.325px |
| Title Small | CursorGothic | 22px | 400 | 1.30 | -0.11px |
| Body Serif | jjannon | 19.2px | 500 | 1.50 | normal |
| Body Serif SM | jjannon | 17.28px | 400 | 1.35 | normal |
| Body Sans | CursorGothic | 16px | 400 | 1.50 | normal |
| Button Label | CursorGothic | 14px | 400 | 1.00 | normal |
| Caption | CursorGothic | 11px | 400–500 | 1.50 | normal |
| Mono Body | berkeleyMono | 12px | 400 | 1.67 | normal |
| Mono Small | berkeleyMono | 11px | 400 | 1.33 | -0.275px |

**Regra crítica de letter-spacing:** o tracking do CursorGothic escala com o tamanho:
- 72px → -2.16px | 36px → -0.72px | 26px → -0.325px | 22px → -0.11px | ≤16px → normal

---

## 4. Componentes

### Botões

```css
/* Primary — warm surface */
background: #ebeae5;
color: #26251e;
padding: 10px 12px 10px 14px;
border-radius: 8px;
border: none;
/* hover: */ color: #cf2d56;

/* Secondary Pill */
background: #e6e5e0;
color: rgba(38, 37, 30, 0.6);
padding: 3px 8px;
border-radius: 9999px;
/* hover: */ color: #cf2d56;

/* Ghost */
background: rgba(38, 37, 30, 0.06);
color: rgba(38, 37, 30, 0.55);
padding: 6px 12px;
```

### Cards
```css
background: #e6e5e0; /* ou #f2f1ed */
border: 1px solid rgba(38, 37, 30, 0.1);
border-radius: 8px; /* standard | 4px compact | 10px featured */
/* hover: shadow intensification */
```

### Inputs
```css
background: transparent;
color: #26251e;
border: 1px solid rgba(38, 37, 30, 0.1);
/* focus: */ border-color: rgba(38, 37, 30, 0.2);
```

### Navegação
```css
background: #f2f1ed;
backdrop-filter: blur(12px);
border-bottom: 1px solid rgba(38, 37, 30, 0.1);
/* links: */ font: 14px system-ui weight 500; color: #26251e;
```

---

## 5. Espaçamento

- **Base:** 8px
- **Sub-8px (micro-alinhamentos):** 1.5px, 2px, 2.5px, 3px, 4px, 5px, 6px
- **Escala padrão:** 8, 10, 12, 14, 16, 24, 32, 48, 64, 96px

### Border Radius
| Nome | Valor | Uso |
|------|-------|-----|
| Micro | 1.5px | Elementos de detalhe fino |
| Small | 2px | Elementos inline |
| Medium | 3–4px | Containers compactos, badges |
| Standard | 8px | Botões primários, cards, menus |
| Featured | 10px | Cards destacados |
| Full Pill | 9999px | Tags, filtros, badges pill |

---

## 6. Interações

- **Hover de botão:** texto muda para `#cf2d56` (warm crimson) — signature interaction deste design
- **Hover de link:** shift para `#f54e00` (orange accent) ou underline `rgba(38,37,30,0.4)`
- **Hover de card:** intensificação de sombra (ambient → elevated)
- **Foco:** `box-shadow: rgba(0,0,0,0.1) 0px 4px 12px` — sem blue ring frio
- **Transições:** 150ms ease para cores, 200ms ease para sombras

---

## 7. Responsividade

| Breakpoint | Largura | Mudanças chave |
|-----------|---------|----------------|
| Mobile | <600px | Coluna única, nav colapsada, padding reduzido |
| Tablet SM | 600–768px | Grid de 2 colunas |
| Tablet | 768–900px | Sidebar aparece |
| Desktop SM | 900–1279px | Layout completo formando |
| Desktop | >1279px | Layout completo, max-width ~1200px |

**Headings responsivos:** 72px → 36px → 26px mantendo o letter-spacing proporcional.

---

## 8. Checklist de Conformidade

Antes de qualquer commit de frontend, verificar:

- [ ] Background usa `#f2f1ed` (não branco puro `#ffffff`)
- [ ] Texto primário é `#26251e` (não `#000000` nem `#333`)
- [ ] Letter-spacing do CursorGothic escala corretamente com o tamanho
- [ ] Hover de botões usa `#cf2d56` (warm crimson)
- [ ] Bordas usam `rgba(38, 37, 30, 0.1)` ou oklab equivalente
- [ ] Border-radius de botões primários é 8px; pills usam 9999px
- [ ] Sombras de cards usam blur grande (28–70px) com opacidade baixa (0.1–0.14)
- [ ] Três vozes tipográficas respeitadas: CursorGothic (display/UI), jjannon (editorial), berkeleyMono (código)
