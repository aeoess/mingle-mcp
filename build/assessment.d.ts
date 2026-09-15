export declare const ASSESSMENT_MODEL = "gpt-6-astra";
export declare const ASSESSMENT_VERSION = "mingle-reciprocal-v1";
type PublicCard = {
    card_id: string;
    fields: Record<string, string>;
};
/** Only explicitly selected network-visible text enters the provider request. */
export declare function publicAssessmentCard(raw: any): PublicCard | null;
export type AssessmentOptions = {
    key?: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
};
export declare function assessPeople(mine: any, people: any[], options?: AssessmentOptions): Promise<{
    status: "unavailable";
    reason: string;
    model: string;
} | {
    assessments: {
        card_id: string;
        verdict: "plausible_reciprocal_fit" | "no_strong_reciprocal_reason" | "uncertain";
        possible_value_to_me: {
            inference: string;
            evidence: {
                card_id: string;
                field: string;
                quote: string;
            }[];
        };
        possible_value_to_them: {
            inference: string;
            evidence: {
                card_id: string;
                field: string;
                quote: string;
            }[];
        };
        uncertainty: string[];
        question: string;
    }[];
    status: "available";
    model: any;
    assessment_version: string;
    response_id: any;
    usage: {
        input_tokens: any;
        output_tokens: any;
    } | null;
    advisory: string;
}>;
export {};
