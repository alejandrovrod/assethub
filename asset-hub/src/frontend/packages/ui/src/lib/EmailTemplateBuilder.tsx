import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Section,
  Text,
  render,
} from "react-email";

export interface EmailTableRow {
  label: string;
  value: string | number | boolean;
}

export interface EmailFooterOptions {
  customMessage?: string;
  year?: number;
}

interface EmailLogo {
  src: string;
  alt?: string;
}

interface EmailCta {
  label: string;
  href: string;
}

const FONT_STACK = "Arial, Helvetica, sans-serif";
const BODY_BG = "#f4f5f7";
const HEADER_BG = "#1e2a4a";
const CARD_BG = "#ffffff";
const TEXT_COLOR = "#333333";
const MUTED_COLOR = "#5a6474";
const BORDER_COLOR = "#dde2ea";
const FOOTER_COLOR = "#8a93a3";
const MAX_WIDTH = 600;

const SUPPORT_STYLES = [
  "@media only screen and (max-width:480px){",
  ".email-table-cell{display:block !important;width:100% !important;box-sizing:border-box;}",
  ".email-table-label{border-bottom:0 !important;}",
  ".email-table-value{border-top:0 !important;}",
  "}",
  "@media only screen and (max-width:400px){",
  ".email-cta{display:block !important;width:100% !important;box-sizing:border-box;text-align:center !important;}",
  "}",
].join("");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCellValue(value: EmailTableRow["value"]): string {
  return typeof value === "boolean" ? (value ? "Sí" : "No") : String(value);
}

export class EmailTemplateBuilder {
  private logo?: EmailLogo;
  private title?: string;
  private greetingName?: string;
  private paragraphs: string[] = [];
  private tables: EmailTableRow[][] = [];
  private cta?: EmailCta;
  private footerOptions: EmailFooterOptions = {};
  private placeholders = new Map<string, string>();

  withLogo(src: string, alt?: string): this {
    this.logo = { src, alt };
    return this;
  }

  withTitle(text: string): this {
    this.title = text;
    return this;
  }

  withGreeting(name: string): this {
    this.greetingName = name;
    return this;
  }

  withParagraph(text: string): this {
    this.paragraphs.push(text);
    return this;
  }

  withTable(rows: EmailTableRow[]): this {
    this.tables.push(rows);
    return this;
  }

  withButton(label: string, href: string): this {
    this.cta = { label, href };
    return this;
  }

  withFooter(options?: EmailFooterOptions): this {
    this.footerOptions = { ...this.footerOptions, ...options };
    return this;
  }

  addPlaceholder(key: string, value: string): this {
    this.placeholders.set(key, value);
    return this;
  }

  async build(): Promise<string> {
    const html = await render(this.renderTree());
    return this.applyPlaceholders(html);
  }

  private renderTree(): React.ReactNode {
    const { customMessage, year = new Date().getFullYear() } = this.footerOptions;

    return (
      <Html lang="es" style={{ fontFamily: FONT_STACK }}>
        <Head>
          <style dangerouslySetInnerHTML={{ __html: SUPPORT_STYLES }} />
        </Head>
        <Body
          style={{
            margin: 0,
            padding: "24px 12px",
            backgroundColor: BODY_BG,
            fontFamily: FONT_STACK,
          }}
        >
          <Container
            style={{
              maxWidth: `${MAX_WIDTH}px`,
              width: "100%",
              margin: "0 auto",
              backgroundColor: CARD_BG,
              borderRadius: 8,
              padding: 0,
            }}
          >
            {this.renderHeader()}
            {this.renderContent()}
            {this.renderFooter(customMessage, year)}
          </Container>
        </Body>
      </Html>
    );
  }

  private renderHeader(): React.ReactNode {
    const logo = this.logo ? (
      <Img
        src={this.logo.src}
        alt={this.logo.alt ?? ""}
        width={140}
        style={{
          display: "block",
          width: "140px",
          maxWidth: "140px",
          height: "auto",
          margin: "0 auto 12px",
          border: 0,
          outline: "none",
          textDecoration: "none",
        }}
      />
    ) : null;

    const title = this.title ? (
      <Heading
        as="h1"
        style={{
          margin: 0,
          fontSize: "24px",
          lineHeight: "32px",
          fontWeight: "bold",
          color: "#ffffff",
          textAlign: "center",
        }}
      >
        {this.title}
      </Heading>
    ) : null;

    if (!logo && !title) {
      return null;
    }

    return (
      <Section
        style={{
          backgroundColor: HEADER_BG,
          padding: "36px 24px",
          borderRadius: "8px 8px 0 0",
        }}
      >
        {logo}
        {title}
      </Section>
    );
  }

  private renderContent(): React.ReactNode {
    const blocks: React.ReactNode[] = [];

    if (this.greetingName !== undefined) {
      blocks.push(
        <Text
          key="greeting"
          style={{
            margin: "0 0 16px",
            fontSize: "18px",
            lineHeight: "26px",
            fontWeight: "bold",
            color: HEADER_BG,
          }}
        >
          {`Hola ${this.greetingName},`}
        </Text>
      );
    }

    this.paragraphs.forEach((paragraph, index) => {
      blocks.push(
        <Text
          key={`paragraph-${index}`}
          style={{ margin: "0 0 16px", fontSize: "16px", lineHeight: "24px", color: TEXT_COLOR }}
        >
          {paragraph}
        </Text>
      );
    });

    this.tables.forEach((rows, tableIndex) => {
      blocks.push(
        <table
          key={`table-${tableIndex}`}
          cellPadding={0}
          cellSpacing={0}
          border={0}
          width="100%"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: FONT_STACK,
            marginBottom: 24,
          }}
        >
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td
                  className="email-table-cell email-table-label"
                  width="42%"
                  style={{
                    padding: "10px 14px",
                    border: `1px solid ${BORDER_COLOR}`,
                    backgroundColor: "#f7f8fb",
                    fontSize: "14px",
                    lineHeight: "20px",
                    color: MUTED_COLOR,
                  }}
                >
                  {row.label}
                </td>
                <td
                  className="email-table-cell email-table-value"
                  style={{
                    padding: "10px 14px",
                    border: `1px solid ${BORDER_COLOR}`,
                    fontSize: "14px",
                    lineHeight: "20px",
                    color: HEADER_BG,
                    fontWeight: "bold",
                  }}
                >
                  {formatCellValue(row.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    });

    if (this.cta) {
      blocks.push(
        <Section key="cta" align="center" style={{ margin: "8px 0 24px" }}>
          <Button
            href={this.cta.href}
            className="email-cta"
            style={{
              backgroundColor: HEADER_BG,
              borderRadius: 6,
              color: "#ffffff",
              fontFamily: FONT_STACK,
              fontSize: "16px",
              fontWeight: "bold",
              lineHeight: "20px",
              textDecoration: "none",
              textAlign: "center",
              padding: "14px 32px",
              display: "inline-block",
            }}
          >
            {this.cta.label}
          </Button>
        </Section>
      );
    }

    return (
      <Section style={{ padding: "32px 24px", backgroundColor: CARD_BG }}>
        {blocks}
      </Section>
    );
  }

  private renderFooter(
    customMessage: string | undefined,
    year: number
  ): React.ReactNode {
    return (
      <Section
        style={{
          backgroundColor: BODY_BG,
          padding: 24,
          borderTop: `1px solid ${BORDER_COLOR}`,
        }}
      >
        {customMessage ? (
          <Text
            style={{
              margin: "0 0 8px",
              fontSize: "12px",
              lineHeight: "18px",
              color: FOOTER_COLOR,
              textAlign: "center",
            }}
          >
            {customMessage}
          </Text>
        ) : null}
        <Text
          style={{
            margin: 0,
            fontSize: "12px",
            lineHeight: "18px",
            color: FOOTER_COLOR,
            textAlign: "center",
          }}
        >
          © {year}
        </Text>
      </Section>
    );
  }

  private applyPlaceholders(html: string): string {
    let result = html;
    for (const [key, value] of this.placeholders) {
      result = result.split(`{{${key}}}`).join(escapeHtml(value));
    }
    return result;
  }
}
