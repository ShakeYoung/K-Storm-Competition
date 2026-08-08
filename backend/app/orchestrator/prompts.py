"""Prompt 构造与文本工具。

包含 intake / debate / moderator / critique / citation review / IR / 最终报告的 prompt 构造，
文档 intake 的文本工具（摘要、预算、类型推断）与相关常量。
从 orchestrator/runner.py 拆出，runner.py 只保留编排逻辑。
"""
from __future__ import annotations

import re

from app.schemas.models import DebateMessage, ResearchStage, StructuredBrief, TemplateInput

DOC_INLINE_THRESHOLD_CHARS = 12000

DOC_EXTRACT_HEAD_CHARS = 6000

DOC_EXTRACT_TAIL_CHARS = 2000

DOC_SUMMARY_MAX_CHARS = 420

INTAKE_DOC_SUMMARY_BUDGET = 9000

def research_stage_label(stage: ResearchStage | str) -> str:
    value = str(stage)
    return {
        ResearchStage.AUTO.value: "自动判断",
        ResearchStage.TOPIC_EXPLORATION.value: "选题探索",
        ResearchStage.PLAN_REFINEMENT.value: "方案收敛",
        ResearchStage.RESULT_DIAGNOSIS.value: "结果诊断",
        ResearchStage.PIVOT_EVALUATION.value: "转向评估",
    }.get(value, value)

def stage_goal_text(stage: ResearchStage | str) -> str:
    value = str(stage)
    return {
        ResearchStage.TOPIC_EXPLORATION.value: "当前阶段以探索新方向和候选课题为主,可以给出课题名称建议。",
        ResearchStage.PLAN_REFINEMENT.value: "当前阶段以推进和完善现有课题为主,不要把重新推荐新课题作为主轴。",
        ResearchStage.RESULT_DIAGNOSIS.value: "当前阶段以解释结果、定位瓶颈、设计补充实验为主,不要通篇转成新选题推荐。",
        ResearchStage.PIVOT_EVALUATION.value: "当前阶段以判断是否需要局部修正或转向为主;若当前路线偏差较大,可在报告后段给出转向建议。",
    }.get(value, "请根据当前科研阶段组织输出。")

def _document_window(content: str) -> str:
    text = (content or "").strip()
    if len(text) <= DOC_EXTRACT_HEAD_CHARS + DOC_EXTRACT_TAIL_CHARS:
        return text
    head = text[:DOC_EXTRACT_HEAD_CHARS].rstrip()
    tail = text[-DOC_EXTRACT_TAIL_CHARS:].lstrip()
    return f"{head}\n\n[...中间内容已省略以控制 intake 成本...]\n\n{tail}"

def total_document_chars(documents: list[UploadedDocument]) -> int:
    return sum(len((document.content or "").strip()) for document in documents)

def needs_hybrid_intake(documents: list[UploadedDocument]) -> bool:
    return total_document_chars(documents) > DOC_INLINE_THRESHOLD_CHARS

def document_extract_prompt(document: UploadedDocument) -> str:
    excerpt = _document_window(document.content or "") or "无可读取文本"
    return f"""
请为入口 briefing 提取单份文档摘要,目标是服务后续科研讨论,而不是复写全文。

文档名称:{document.name}
文档类型:{document.doc_type}
用户注释:{document.note or '无'}

文档内容窗口:
<document>
{excerpt}
</document>

输出要求:
1. 只保留对科研选题/方案推进必要的信息。
2. 优先提取:研究目标、实验设计、关键数据/现象、已验证结论、限制条件、待验证问题。
3. 删除重复背景和无关细节,不编造文档中不存在的数据。
4. 输出 5-8 条中文短 bullet,每条尽量 30-80 字,总长度控制在 180-420 中文字。
5. 最后一行必须输出:<<<END_OF_DOC_EXTRACT>>>
""".strip()

def _fallback_doc_summary(document: UploadedDocument) -> str:
    excerpt = _document_window(document.content or "") or "无可读取文本"
    lines = [l.strip() for l in excerpt.splitlines() if l.strip()]
    preview = "\n".join(lines[:6])
    return f"[摘要提取失败,以下为原文头尾裁切片段]\n{preview}".strip()

def _is_tabular_document(document: UploadedDocument) -> bool:
    name = (document.name or "").lower()
    if name.endswith((".csv", ".tsv", ".tsv.gz", ".csv.gz")):
        return True
    if document.doc_type == "experiment-data":
        content = (document.content or "")[:4000]
        lines = [l for l in content.splitlines() if l.strip()]
        if len(lines) >= 3:
            sep_counts = [l.count(",") + l.count("\t") for l in lines[:5]]
            if all(c >= 2 for c in sep_counts):
                return True
    return False

def _deterministic_table_summary(document: UploadedDocument) -> str:
    content = (document.content or "").strip()
    if not content:
        return "[空文档]"
    lines = content.splitlines()
    total_rows = len(lines)
    sep = "\t" if "\t" in (lines[0] if lines else "") else ","
    header = lines[0].strip() if lines else ""
    columns = [c.strip().strip('"') for c in header.split(sep)] if header else []
    sample_head = "\n".join(lines[:4])
    sample_tail = "\n".join(lines[-3:]) if total_rows > 6 else ""
    parts = [
        f"表格维度:{total_rows} 行 × {len(columns)} 列",
        f"列名:{', '.join(columns[:20])}" if columns else "",
    ]
    if document.note and document.note.strip():
        parts.append(f"用户注释:{document.note.strip()}")
    parts.append(f"头部示例:\n{sample_head}")
    if sample_tail:
        parts.append(f"尾部示例:\n{sample_tail}")
    return "\n".join(p for p in parts if p)

def budget_document_summaries(documents: list[UploadedDocument], max_chars: int = INTAKE_DOC_SUMMARY_BUDGET) -> list[str]:
    entries = []
    for document in documents:
        payload = "\n".join(
            item
            for item in [
                f"文档名称:{document.name}",
                f"文档类型:{document.doc_type}",
                f"用户注释:{document.note or '无'}",
                f"摘要:{document.summary}" if document.summary else "",
            ]
            if item
        )
        if payload:
            entries.append(payload)
    if not entries:
        return []

    kept: list[str] = []
    used = 0
    for entry in entries:
        if used + len(entry) <= max_chars:
            kept.append(entry)
            used += len(entry)
            continue
        remaining = max_chars - used
        if remaining <= 120:
            break
        kept.append(_compact(entry, remaining))
        break
    return kept

def document_budget_warnings(
    documents: list[UploadedDocument],
    max_chars: int = INTAKE_DOC_SUMMARY_BUDGET,
) -> list[str]:
    """检测因摘要超出 Intake 预算而被静默丢弃的文档，返回用户可见的警告列表。"""
    if not documents or not needs_hybrid_intake(documents):
        return []
    entries: list[tuple[str, str]] = []
    for document in documents:
        payload = "\n".join(
            item
            for item in [
                f"文档名称:{document.name}",
                f"文档类型:{document.doc_type}",
                f"用户注释:{document.note or '无'}",
                f"摘要:{document.summary}" if document.summary else "",
            ]
            if item
        )
        if payload:
            entries.append((document.name, payload))
    if not entries:
        return []
    used = 0
    for i, (name, entry) in enumerate(entries):
        if used + len(entry) <= max_chars:
            used += len(entry)
        else:
            remaining = max_chars - used
            if remaining <= 120:
                dropped = [n for n, _ in entries[i:]]
            else:
                dropped = [n for n, _ in entries[i + 1:]]
            if dropped:
                return [
                    f"以下 {len(dropped)} 份文档因摘要总量超出 Intake 预算（{max_chars} 字符）"
                    f"未能进入分析，可能影响结论完整性：{', '.join(dropped)}"
                ]
            break
    return []

def intake_prompt(template: TemplateInput, documents: list[UploadedDocument]) -> str:
    use_hybrid = needs_hybrid_intake(documents)
    if use_hybrid:
        document_entries = budget_document_summaries(documents)
        document_text = "\n\n".join(document_entries)
        intake_source_note = "以下内容为上传文档的预提取摘要与用户注释,不再包含文档全文。"
        reading_requirement = "请基于模板 + 文档摘要形成高密度入口 briefing;如果文档摘要中信息不足,请明确保留不确定性。"
    else:
        document_text = "\n\n".join(
            [
                "\n".join(
                    [
                        f"文档名称:{document.name}",
                        f"文档类型:{document.doc_type}",
                        f"用户注释:{document.note or '无'}",
                        "文档全文如下:",
                        "<document>",
                        document.content or "无可读取文本",
                        "</document>",
                    ]
                )
                for document in documents
            ]
        )
        intake_source_note = "以下内容包含上传文档全文。"
        reading_requirement = "请完整阅读用户模板和所有上传文档,形成一份只供讨论组使用的入口整合 briefing。"
    return f"""
{template_prompt(template)}

上传文档:
{intake_source_note}
{document_text or '无上传文档。'}

{reading_requirement}
要求:
1. 先分别提炼 design、experiment-data、other 文档中的关键事实、实验设计、已有结果、限制条件和待验证点。
2. 再合并用户模板,整理成可靠、可控、尽量不流失重点的前置信息。
3. 明确区分"已知事实""用户设想""从文档推断的机会点""仍不确定的问题"。
4. 不得编造文档中不存在的数据或结论。
5. 输出中文 Markdown,结构清晰,供后续讨论 Agent 直接使用;后续讨论组不会再看到文档全文。
6. 严格控制长度:优先高密度信息,不写长篇报告;建议 1800-3000 中文字,最多不超过 4000 中文字。
7. 对每份上传文档只保留对选题讨论必要的信息:核心设计、关键数据、已验证结论、约束和待验证问题;删除重复背景和无关细节。
8. 最后一行必须输出:<<<END_OF_INTAKE>>>
""".strip()

def template_prompt(template: TemplateInput) -> str:
    return "\n".join(
        [
            f"研究领域:{template.field}",
            f"实验大背景:{template.background}",
            f"已有研究基础:{template.existing_basis}",
            f"初步想法:{template.extension_points}",
            f"核心科学问题:{template.core_question}",
            f"可用技术平台:{template.platforms}",
            f"资源限制:{template.constraints}",
            f"目标产出:{template.target_output}",
            f"偏好方向:{template.preferred_direction}",
            f"避免方向:{template.avoid_direction}",
        ]
    )

def debate_prompt(
    *,
    template: TemplateInput,
    brief: StructuredBrief,
    round_number: int,
    agent: AgentSpec,
    history: list[DebateMessage],
    independent_first_round: bool = False,
    mode_context: str = "",
    research_stage: ResearchStage | str = ResearchStage.AUTO,
) -> str:
    round_tasks = {
        1: "独立提出观点,不要重复其他 Agent 的职责;本轮不需要回应其他 Agent。",
        2: "优先回应 Moderator 指出的冲突点、遗漏点,再针对前面观点进行反驳、补充和修正。",
        3: "给出最终推荐、优先级判断和可执行建议。",
    }
    history_text = _debate_history_text(history[-8:])

    # P1: R1 只保留精简 briefing,R2/R3 通过 moderator 补充的 history 获取完整上下文
    if round_number == 1:
        top_facts = ";".join(brief.known_facts[:5])
        brief_section = f"""结构化 briefing(精简):
- 研究上下文:{brief.research_context}
- 核心已知事实:{top_facts}
- 关键未知问题:{";".join(brief.unknowns[:3])}

入口 Agent 整合 briefing(以此为主要前置信息,不得假设还能读取上传文档全文):
{brief.intake_synthesis or "入口 Agent 未提供额外整合内容。"}"""
    else:
        brief_section = f"""结构化 briefing:
- 研究上下文:{brief.research_context}
- 已知事实:{";".join(brief.known_facts)}
- 未知问题:{";".join(brief.unknowns)}
- 约束:{";".join(brief.constraints)}
- 机会点:{";".join(brief.opportunity_points)}

入口 Agent 整合 briefing:
{brief.intake_synthesis or "入口 Agent 未提供额外整合内容。"}"""

    return f"""
{template_prompt(template)}

{brief_section}

当前轮次:第 {round_number} 轮
本轮任务:{round_tasks.get(round_number, "继续收敛并给出优先级判断。")}
当前 Agent:{agent.display_name} / {agent.role}
科研阶段:{research_stage_label(research_stage)}
阶段目标:{stage_goal_text(research_stage)}
执行方式:{"第 1 轮并行独立发言,不读取其他 Agent 当轮内容。" if independent_first_round else "按讨论顺序串行推进。"}

已有讨论:
{history_text or "暂无,当前 Agent 是本次讨论的早期发言者。"}

{mode_context}
全局原则:
- 若用户已提供较完整的当前课题、实验设计或实验结果,默认目标是帮助其推进、完善、诊断和创新当前路线。
- 除非当前路线存在明显结构性缺陷,否则不要把"重新推荐新课题"作为主要输出。
- 如发现更优方向偏差较大,可将其作为"转向建议"或"备选方向"提出,而不是替代当前主轴。

输出要求:
- 用中文 Markdown 输出,观点主体控制在 800-1500 字,内容具体、可执行,避免空泛套话。
- 不要逐条复述已知事实,直接给出你的判断和建议。
- 追加以下结构化小节:

### 给结构化 IR 的要点摘要
- 关键主张:
- 支撑依据:
- 风险或反驳点:
- 建议进入 IR 的下一步动作:

该小节控制在 80-150 中文字,不要复述全文。

### 外部引用
每条一行,格式:[类型] 标题 | 作者/来源 | 链接 | 年份 | 支撑的观点
类型: paper / blog / dataset / book / other
- 至少 1 条外部论据(论文、预印本、技术博客、公共数据集均可)。
- 标题必填;记不清信息时链接写"待确认"。
- 不要编造不存在的论文、作者或链接。

最后一行必须输出:<<<END_OF_AGENT_MESSAGE>>>
""".strip()

DEBATE_HISTORY_PER_AGENT_BUDGET = 3500

def _debate_history_text(messages: list[DebateMessage]) -> str:
    """Compressed debate history for R2/R3 prompts.

    Each agent's output is reduced to IR summary + claims + concerns,
    with a higher per-agent budget than moderator (agents need more detail
    for rebuttals). Falls back to head+tail excerpt if no structured fields.
    """
    parts: list[str] = []
    for message in messages:
        sections: list[str] = []
        ir = message.ir_summary or _extract_ir_summary(message.content)
        if ir:
            sections.append(f"[IR 摘要]\n{ir}")
        claims = message.claims or _extract_claims(message.content)
        if claims:
            sections.append("[核心主张]\n" + "\n".join(f"- {c}" for c in claims))
        concerns = message.concerns or _extract_concerns(message.content)
        if concerns:
            sections.append("[主要顾虑]\n" + "\n".join(f"- {c}" for c in concerns))
        if not sections:
            sections.append("[全文裁切]\n" + _compact(message.content, DEBATE_HISTORY_PER_AGENT_BUDGET))
        body = "\n\n".join(sections)
        if len(body) > DEBATE_HISTORY_PER_AGENT_BUDGET:
            body = body[:DEBATE_HISTORY_PER_AGENT_BUDGET] + "..."
        parts.append(f"[Round {message.round} | {message.agent}]\n{body}")
    return "\n\n".join(parts)

def moderator_prompt(
    template: TemplateInput,
    brief: StructuredBrief,
    messages: list[DebateMessage],
    research_stage: ResearchStage | str = ResearchStage.AUTO,
) -> str:
    first_round = [message for message in messages if message.round == 1]
    return f"""
请基于第 1 轮独立发言,生成 Moderator 汇总。

科研阶段:{research_stage_label(research_stage)}
阶段目标:{stage_goal_text(research_stage)}

你必须输出:
1. 各 Agent 已形成的互补点
2. 明显冲突或优先级分歧
3. 候选方向聚类:把相似想法合并成 A/B/C/D 方向,并指出哪些只是换皮重复
4. 每个候选方向的初步支持证据、最弱证据点、最大可行性风险
5. 遗漏/缺失的信息、关键变量或实验控制
6. 第 2 轮每个 Agent 必须回应的具体问题
7. 如果当前阶段不是"选题探索",必须优先围绕用户现有课题推进;只有在发现明显方向偏差时,才把转向建议放在最后。
8. 末尾追加"### 给结构化 IR 的要点摘要",控制在 120-220 中文字,并明确列出候选方向、冲突点和待审查点。
9. 最后一行必须输出:<<<END_OF_MODERATOR_MESSAGE>>>

用户模板:
{template_prompt(template)}

入口 briefing:
{brief.intake_synthesis or brief.model_dump_json()}

第 1 轮发言(压缩摘要):
{_moderator_messages_text(first_round)}
""".strip()

def critique_prompt(
    template: TemplateInput,
    brief: StructuredBrief,
    messages: list[DebateMessage],
    research_stage: ResearchStage | str = ResearchStage.AUTO,
) -> str:
    """独立批判阶段 prompt：在所有讨论轮次结束后，对整个讨论进行多维批判审查。"""
    all_claims = []
    for msg in messages:
        if msg.claims:
            all_claims.append(f"[{msg.agent} R{msg.round}] {'; '.join(msg.claims[:3])}")
    claims_text = "\n".join(all_claims) if all_claims else "（无结构化主张摘要，请从讨论记录中提取）"
    return f"""
你是独立批判审查 Agent。请对以下科研头脑风暴的完整讨论进行结构化批判审查，产出风险评估报告。

科研阶段：{research_stage_label(research_stage)}

研究背景：
{template_prompt(template)}

入口 briefing 摘要：
{briefing_for_report(brief)}

各 Agent 核心主张摘要：
{claims_text}

完整讨论记录摘要（仅供参考，不要逐字复述）：
{discussion_digest(messages)}

请按以下六个维度逐一输出「风险等级（低/中/高）」+「具体问题描述」+「改进建议」：

## 1. 创新性风险
风险等级：[低/中/高]
具体问题：
改进建议：

## 2. 证据链完整性
风险等级：[低/中/高]
具体问题：
改进建议：

## 3. 可行性盲点
风险等级：[低/中/高]
具体问题：
改进建议：

## 4. 逻辑一致性
风险等级：[低/中/高]
具体问题：
改进建议：

## 5. 偏见与盲区
风险等级：[低/中/高]
具体问题：
改进建议：

## 6. 下一步风险
风险等级：[低/中/高]
具体问题：
改进建议：

## 综合风险评估
综合风险等级：[低/中/高]
最值得关注的 Top-3 风险：
1.
2.
3.

最后一行必须输出：<<<END_OF_CRITIQUE>>>
""".strip()

def citation_review_prompt(
    template: TemplateInput,
    messages: list[DebateMessage],
) -> str:
    """引用真实性审查 prompt：对所有 Agent 引用的文献进行语义交叉验证。"""
    ref_lines = []
    for msg in messages:
        # 从每条发言中提取外部引用小节
        content = msg.content or ""
        marker = "### 外部引用"
        idx = content.find(marker)
        if idx >= 0:
            section = content[idx + len(marker):]
            end = section.find("\n###")
            if end >= 0:
                section = section[:end]
            for line in section.strip().splitlines():
                line = line.strip().lstrip("-•* ")
                if line:
                    ref_lines.append(f"[{msg.agent} R{msg.round}] {line}")
    refs_text = "\n".join(ref_lines) if ref_lines else "（讨论中未发现结构化引用行，请基于发言正文分析引用情况）"
    return f"""
你是引用线索审查 Agent。请对以下讨论中各 Agent 引用的外部文献进行线索一致性、完整性和相关性的检查。

重要边界：你只能基于讨论文本本身做线索层面的交叉检查，不能访问外部文献数据库（如 Crossref、OpenAlex、Semantic Scholar）。因此你的检查不能替代对文献真实存在性的核实——对于无法在讨论文本中交叉印证的引用，应标注「需人工核实」，而不是断言其真实或虚假。

研究领域：{template.field}

所有引用条目（格式：[Agent 名 轮次] 引用内容）：
{refs_text}

讨论摘要（仅供上下文，不要逐字引用）：
{discussion_digest(messages)}

请按以下四个维度进行审查，并对每条引用给出「线索可信度评分（高/中/低/存疑）」：

## 1. 引用相关性
（逐条检查引用与论点的相关性，标出偏题引用）

## 2. 引用完整性
（检查引用格式完整性，标出无法追溯的泛化引用）

## 3. 引用一致性
（检查不同 Agent 对同类文献的结论是否矛盾，矛盾是否已被解释）

## 4. 引用密度
（评估整体引用密度，列出缺乏文献支撑的关键论断）

## 各引用线索可信度评分
（逐条评分，格式：[引用条目] → 线索评分：高/中/低/存疑 | 理由；存疑用于无法在文本内交叉印证、需外部数据库核实的条目）

## 整体引用线索质量评级
整体引用线索质量：[A/B/C/D]（A=优秀，B=良好，C=需改进，D=不足）
需要补充文献或人工核实的关键论断清单：
1.
2.
3.

最后一行必须输出：<<<END_OF_CITATION_REVIEW>>>
""".strip()

def summary_prompt(
    template: TemplateInput,
    brief: StructuredBrief,
    messages: list[DebateMessage],
    research_stage: ResearchStage | str = ResearchStage.AUTO,
) -> str:
    return f"""
请基于以下模板、入口 briefing 和讨论摘要生成 V1.5 结构化 IR(Intermediate Representation)。
它不是普通总结,而是研究方向决策结构体:必须把候选方向、证据、批判点和排序理由绑定起来。

科研阶段:{research_stage_label(research_stage)}
阶段目标:{stage_goal_text(research_stage)}

输出硬性要求:
1. 必须先输出一个 ```json fenced code block,且必须是合法 JSON。
2. JSON 顶层字段必须包含:
   - version: "1.5"
   - decision_summary: 字符串
   - key_claims: 字符串数组
   - evidence_refs: 数组,每项含 id/source_type/source_id/source_title/quote_or_summary/supports
   - critique_points: 数组,每项含 id/target_id/dimension/severity/content/mitigation
   - candidate_directions: 数组,每项含 id/title/research_question/rationale/novelty/feasibility/risks/alternatives/priority/priority_reason/evidence_refs/critique_refs/next_actions
3. candidate_directions 需要 3-5 个方向;priority 用 1 表示最推荐,数字越大优先级越低。
4. 每个候选方向必须绑定至少 1 个 evidence_refs 和至少 1 个 critique_refs。
5. evidence_refs 可以来自 uploaded_document、template、intake_briefing、agent_debate;没有逐字引用时,用 quote_or_summary 写"证据摘要"。
6. critique 不能只写泛泛风险,必须进入排序判断:创新性、证据强度、可行性、资源约束、替代路线至少覆盖其中 3 类。
7. JSON 后再输出"## 结构化 IR 文档",中文 Markdown,控制在 1200-2200 中文字之间。
8. Markdown 只保留:决策摘要、候选方向排序、证据链、批判点、主要风险、替代路线、下一步动作。
9. 不要逐字复述 Agent 发言,不要生成 mermaid/graph/code block。
10. 如果当前阶段不是"选题探索",candidate_directions 应优先表达"推进路径 / 解释路径 / 诊断路径 / 调整路径",不要机械地改写成新课题名称。
11. 最后一行必须输出:<<<END_OF_GROUP_SUMMARY>>>

{template_prompt(template)}

入口 briefing 摘要:
{briefing_for_report(brief)}

讨论摘要:
{ir_feedback_text(messages)}
""".strip()

def summary_prompt_focused(
    template: TemplateInput,
    brief: StructuredBrief,
    messages: list[DebateMessage],
    research_stage: ResearchStage | str = ResearchStage.AUTO,
) -> str:
    """Focused / Memory 模式的精简 IR prompt:只要求决策摘要、核心观点和少量候选方向。"""
    return f"""
请基于以下模板、入口 briefing 和讨论摘要生成精简版结构化 IR。
本次是聚焦/追问讨论,不需要完整的选题评估,只需要提炼讨论的核心发现。

科研阶段:{research_stage_label(research_stage)}
阶段目标:{stage_goal_text(research_stage)}

输出硬性要求:
1. 必须先输出一个 ```json fenced code block,且必须是合法 JSON。
2. JSON 顶层字段必须包含:
   - version: "1.5-lite"
   - decision_summary: 字符串,本次讨论的核心结论
   - key_claims: 字符串数组,各 Agent 的关键主张
   - evidence_refs: 数组,每项含 id/source_type/source_title/quote_or_summary/supports
   - candidate_directions: 数组(2-3 个即可),每项含 id/title/rationale/evidence_refs
3. evidence_refs 尽量关联到具体的 Agent 发言或 briefing 内容。
4. JSON 后再输出中文 Markdown 摘要,控制在 600-1200 字之间,包含:核心结论、各视角要点、待解决问题。
5. 最后一行必须输出:<<<END_OF_GROUP_SUMMARY>>>

{template_prompt(template)}

入口 briefing 摘要:
{briefing_for_report(brief)}

讨论摘要:
{ir_feedback_text(messages)}
""".strip()

def report_prompt(
    template: TemplateInput,
    brief: StructuredBrief,
    messages: list[DebateMessage],
    group_summary: str,
    structured_ir: StructuredIRV2 | None = None,
    research_stage: ResearchStage | str = ResearchStage.AUTO,
) -> str:
    return f"""
请生成 K-Storm 最终 Markdown 报告。报告定位是"开题/组会科研设计讨论稿",不是只列选题的清单。

【输出语言要求】
全程使用中文。禁止在报告正文中出现英文字段名（novelty、feasibility、evidence_refs、priority 等），
须转换为「创新性」「可行性」「支撑证据」「优先级」等中文表述。
报告标题格式：# 【{research_stage_label(research_stage)}】{{研究领域}} 科研选题分析报告

科研阶段：{research_stage_label(research_stage)}
阶段目标：{stage_goal_text(research_stage)}

必须按以下顺序输出板块：
0. 报告标题（格式见上）
1. 当前科研阶段说明（1-2 句，解释当前处于哪个阶段、本报告的分析侧重点）
2. 【推荐方向优先级汇总】（仅在选题探索阶段输出，其他阶段可省略此板块）
   - 用 Markdown 表格输出 Top 3 方向的简明对比，列：方向名称 | 创新性 | 可行性 | 周期风险 | 推荐理由（一句话）
   - 表格之后用 1-2 句点出**首推方向**及核心理由，便于开题汇报时快速引用
3. 用户输入摘要：说明研究背景、已有基础、资源约束和目标产出。
4. 前置信息整合：把入口 briefing 中的已有数据、上传文档重点、可用技术平台和不能丢失的事实压缩成研究出发点。
5. 核心科学问题提炼：给出 1 个主问题和 2-4 个子问题。
6. 机制框架与可检验假设：说明变量关系、可能因果链条、关键测量指标，以及哪些环节最值得验证。
7. 根据科研阶段组织主体内容：
   - 选题探索：输出「推荐选题 Top 3-5」详细分析。
   - 方案收敛 / 结果诊断 / 转向评估：主体围绕当前课题推进、完善、诊断和修正，不要通篇落在新课题命名上。
8. 如果当前阶段是选题探索，每个 Top 方向包含：题目名称、核心科学问题、创新点、可行性分析、实验路线、关键验证实验、风险点、替代方案、适合产出类型。
9. 每个核心方向或推进路径的支撑证据：
   - 从 V1.5 决策结构体的支撑证据列表中提取该方向绑定的证据。
   - 每条证据写明：来源类型（研究模板 / 入口整合 / 上传文档 / 讨论发言）、来源标题、引用摘要、支撑点。
   - 如某方向无证据绑定，标注「该方向缺乏支撑证据」并说明风险。
10. 每个核心方向或推进路径的批判审查：最强创新点、最弱证据点、最大可行性风险、与已有基础匹配度、替代路线。
11. 证据链与实验设计：把 Top 方向或当前主路线串成可执行的最小实验包，说明样本/模型/分组/指标/判定标准。
12. 风险、替代路线与收敛条件：失败风险、资源瓶颈、阴性结果如何解释，以及何时应转向备选方案。
13. 综合优先级排序：用简短矩阵比较创新性、证据强度、可行性、周期、风险和产出潜力；排序与 V1.5 决策结构体一致。
14. 下一步 2-4 周行动计划：给出按周推进的具体任务。
15. 开题/组会汇报表述：写成 2-4 段正式但不夸张的正式表述，可直接用于开题答辩或组会汇报。
16. 若当前路线与讨论结果的较优方向偏差较大，可在报告最后增加「转向建议」小节，但不要让它成为全文主轴。

长度要求：
1. 总长度控制在 4500-7000 中文字之间。
2. 不要把主要篇幅都放在 Top 选题列表；背景复盘、机制框架、证据链、实验路径、风险替代方案合计至少占全文一半。
3. 每个 Top 选题短小但完整，避免长篇综述。
4. 不要重复粘贴结构化 IR 原文，要把 IR 转化为用户可直接讨论的研究方案。

禁止输出任何对话式收尾、追加服务推荐或下一步代写邀请，例如"如果你愿意""我下一步可以""可继续整理成 PPT""基金版本"等。
报告只用于开题与组会讨论，不要主动扩展到基金申请场景，除非用户目标产出中明确写了基金。

用户模板:
{template_prompt(template)}

入口 briefing 摘要:
{briefing_for_report(brief)}

结构化 IR(已压缩,必须以此为主,不要扩写成论文全文):
{_compact(group_summary, 4200)}

V1.5 决策结构体(最终报告必须优先消费它的候选方向、证据绑定、批判点和排序理由):
{structured_ir.model_dump_json(indent=2) if structured_ir else "无结构化 JSON,仅可使用 Markdown IR。"}

讨论记录摘要(仅用于核对,不要逐字复述):
{discussion_digest(messages)}

最后一行必须输出:<<<END_OF_FINAL_REPORT>>>
""".strip()

def briefing_for_report(brief: StructuredBrief) -> str:
    return "\n".join(
        [
            f"- 研究上下文:{brief.research_context}",
            f"- 已知事实:{_join_limited(brief.known_facts, 8)}",
            f"- 未知问题:{_join_limited(brief.unknowns, 6)}",
            f"- 约束:{_join_limited(brief.constraints, 6)}",
            f"- 机会点:{_join_limited(brief.opportunity_points, 6)}",
            "- 入口模型整合摘要:",
            _compact(brief.intake_synthesis, 2400) if brief.intake_synthesis else "无额外整合摘要。",
        ]
    )

def discussion_digest(messages: list[DebateMessage]) -> str:
    parts = []
    for message in messages:
        evidence = message.claims or message.concerns
        if evidence:
            content = ";".join(evidence[:4])
        else:
            content = _compact(message.content, 500)
        parts.append(f"[Round {message.round} | {message.agent}] {content}")
    return "\n".join(parts)

def report_prompt_focused(
    template: TemplateInput,
    brief: StructuredBrief,
    messages: list[DebateMessage],
    group_summary: str,
    structured_ir: StructuredIRV2 | None = None,
    research_stage: ResearchStage | str = ResearchStage.AUTO,
) -> str:
    """Focused Panel 模式的报告 prompt:针对特定问题的深度分析,不做选题推荐。"""
    return f"""请生成聚焦分析报告。这不是选题推荐报告,而是针对特定问题的深度分析。

科研阶段:{research_stage_label(research_stage)}
阶段目标:{stage_goal_text(research_stage)}

必须包含以下板块:
1. 问题背景:简要回溯本次讨论聚焦的问题和研究上下文。
2. 各 Agent 核心观点:按 Agent 分别陈述,突出各自视角的独特贡献和关键论据。
3. 共识与分歧:明确各 Agent 之间的一致观点和冲突观点,分析冲突原因。
4. 关键证据与约束:列出本次讨论中出现的关键支撑论据和限制条件。
   - 从 V1.5 决策结构体的 evidence_refs 中按 ID 提取每条证据。
   - 每条证据写明:来源类型、来源标题、引用摘要、支撑点。
   - 如果某条 evidence_ref 引用了不存在的 ID,标注"证据引用异常"。
   - 如果某条证据为空绑定,标注"缺乏支撑证据"并说明风险。
5. 行动建议:针对讨论问题的具体下一步,2-4 条,可执行、有优先级。

长度要求:
1. 总长度控制在 2000-3500 中文字之间。
2. 重点放在各视角对比和证据分析上。
3. 不要输出选题推荐列表、优先级排序矩阵、实验设计包。

禁止输出选题推荐、开题/组会表达版本、行动计划时间表。
禁止输出任何对话式收尾。

用户模板:
{template_prompt(template)}

入口 briefing 摘要:
{briefing_for_report(brief)}

结构化 IR:
{_compact(group_summary, 3000)}

V1.5 决策结构体(按 evidence_refs ID 提取证据):
{structured_ir.model_dump_json(indent=2) if structured_ir else "无结构化 JSON。"}

讨论记录摘要(仅用于核对):
{discussion_digest(messages)}

最后一行必须输出:<<<END_OF_FINAL_REPORT>>>
""".strip()

def report_prompt_memory(
    template: TemplateInput,
    brief: StructuredBrief,
    messages: list[DebateMessage],
    group_summary: str,
    structured_ir: StructuredIRV2 | None = None,
    source_summary: str = "",
    research_stage: ResearchStage | str = ResearchStage.AUTO,
) -> str:
    """Memory Query 模式的报告 prompt:基于历史讨论的追问分析。"""
    return f"""请生成追问分析报告。这不是从零开始的选题分析,而是基于已有历史讨论对新问题的深度回答。

科研阶段:{research_stage_label(research_stage)}
阶段目标:{stage_goal_text(research_stage)}

必须包含以下板块:
1. 源讨论回顾:简要引用源讨论的核心结论(2-3 句),为读者建立上下文。
2. 新问题分析:基于记忆上下文,各 Agent 对新问题的回答和观点。
3. 与历史结论的对比:新发现 vs 已知事实,明确哪些结论被强化、哪些被修正、哪些是新出现的。
4. 更新后的判断:如果新信息改变了某些结论,明确指出改变的内容和原因;如果没有改变,说明为什么原有判断仍然成立。
5. 下一步建议:针对新问题的后续行动,2-3 条。

长度要求:
1. 总长度控制在 2000-3500 中文字之间。
2. 重点放在新旧对比和判断更新上。
3. 不要输出完整的选题推荐、从零开始的背景分析、机制框架。

禁止输出选题推荐列表、优先级排序矩阵、实验设计包、开题/组会表达版本。
禁止输出任何对话式收尾。

{"源讨论核心结论:" + source_summary if source_summary else "无源讨论信息。"}

用户模板:
{template_prompt(template)}

入口 briefing 摘要:
{briefing_for_report(brief)}

结构化 IR:
{_compact(group_summary, 3000)}

V1.5 决策结构体(按 evidence_refs ID 提取证据):
{structured_ir.model_dump_json(indent=2) if structured_ir else "无结构化 JSON。"}

讨论记录摘要(仅用于核对):
{discussion_digest(messages)}

最后一行必须输出:<<<END_OF_FINAL_REPORT>>>
""".strip()

def ir_feedback_text(messages: list[DebateMessage]) -> str:
    parts = []
    for message in messages:
        summary = message.ir_summary or _extract_ir_summary(message.content)
        if not summary:
            summary = ";".join((message.claims or [])[:2] + (message.concerns or [])[:2])
        if not summary:
            summary = _compact(message.content, 420)
        parts.append(f"[Round {message.round} | {message.agent}]\n{summary}")
    return "\n\n".join(parts)

def _join_limited(items: list[str], limit: int) -> str:
    selected = [item for item in items if item][:limit]
    return ";".join(selected) if selected else "无"

def _extract_ir_summary(content: str) -> str:
    marker = "给结构化 IR 的要点摘要"
    if marker not in content:
        return ""
    tail = content.split(marker, 1)[1]
    tail = re.sub(r"^[::\s#-]+", "", tail.strip())
    stop = re.search(r"\n#{1,6}\s+", tail)
    if stop:
        tail = tail[: stop.start()]
    return tail.strip()[:900]

MODERATOR_PER_AGENT_BUDGET = 2800

def _moderator_messages_text(messages: list[DebateMessage]) -> str:
    """Compressed view of debate messages for moderator prompt.

    Each agent's output is reduced to: IR summary + key claims + key concerns.
    Falls back to head+tail excerpt if structured fields are empty.
    Total per-agent output is capped at MODERATOR_PER_AGENT_BUDGET chars.
    """
    parts: list[str] = []
    for message in messages:
        sections: list[str] = []
        ir = message.ir_summary or _extract_ir_summary(message.content)
        if ir:
            sections.append(f"[IR 摘要]\n{ir}")
        claims = message.claims or _extract_claims(message.content)
        if claims:
            sections.append("[核心主张]\n" + "\n".join(f"- {c}" for c in claims))
        concerns = message.concerns or _extract_concerns(message.content)
        if concerns:
            sections.append("[主要顾虑]\n" + "\n".join(f"- {c}" for c in concerns))
        if not sections:
            sections.append("[全文裁切]\n" + _compact(message.content, MODERATOR_PER_AGENT_BUDGET))
        body = "\n\n".join(sections)
        if len(body) > MODERATOR_PER_AGENT_BUDGET:
            body = body[:MODERATOR_PER_AGENT_BUDGET] + "..."
        parts.append(f"[Round {message.round} | {message.agent}]\n{body}")
    return "\n\n".join(parts)

def _compact(text: str, limit: int) -> str:
    normalized = " ".join(text.split())
    return normalized[:limit] + ("..." if len(normalized) > limit else "")

def _extract_claims(content: str) -> list[str]:
    return [
        line.strip("- *")
        for line in content.splitlines()
        if any(keyword in line for keyword in ("创新", "假设", "方向", "建议", "科学问题"))
    ][:4]

def _extract_concerns(content: str) -> list[str]:
    return [
        line.strip("- *")
        for line in content.splitlines()
        if any(keyword in line for keyword in ("风险", "质疑", "不足", "失败", "限制"))
    ][:4]
