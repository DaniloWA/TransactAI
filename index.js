import fs from "fs";
import path from "path";
import fetch from "node-fetch"; // Só mantenha se você estiver usando Node.js < 18
import cliProgress from "cli-progress";
import OfxParser from "node-ofx-parser";

const API_URL = "http://localhost:1234/v1/chat/completions";

async function fetchCategory(transaction, retryCount = 5) {
  const headers = { "Content-Type": "application/json" };

  const isPaciente =
    transaction.amount <= 500 &&
    transaction.description.toLowerCase().includes("transferência recebida");

  const categoriesListCredit = [
    "WISE BRASIL CORRETORA",
    "APLICAÇÃO RDB",
    "PACIENTE",
    "OUTROS",
  ];

  const categoriesList = [
    "SUPERMERCADO",
    "FARMACIA",
    "LANCHES",
    "RESTAURANTE",
    "CONTAS",
    "CARRO",
    "CASA",
    "APLICAÇÃO RDB",
    "OUTROS",
    "WISE BRASIL CORRETORA",
  ];

  let messages;

  if (isPaciente) {
    messages = [
      {
        role: "system",
        content: `Você é um assistente especializado em categorização de transações financeiras.
            A transação contém uma descrição, valor e data. Sua tarefa é identificar a categoria correta entre as seguintes: ${categoriesListCredit.join(
              ", "
            )}.
    
            Aqui estão alguns exemplos de transações e suas respectivas categorias:
            1. "Transação: Transferência recebida pelo Pix - JULIANA HERMINIO M DE MELO - •••.721.797-•• - BCO BANESTES S.A. (0021) Agência: 140 Conta: 1102138-3, Valor: 150.00, Data: 13/06/2023" -> Categoria: PACIENTE
            2. "Transação: Transferência Recebida - Cilene Cantanhede De Almeida - •••.127.313-•• - NU PAGAMENTOS - IP (0260) Agência: 1 Conta: 65842407-3, Valor: 150.00, Data: 23/06/2023" -> Categoria: PACIENTE
            5. "Transação: Transferência recebida pelo Pix - NIC BR - •••.000.278-•• - SUPERDIGITAL I.P. S.A. (0340) Agência: 1 Conta: 1173275-1, Valor: 150.00, Data: 30/06/2023" -> Categoria: OUTROS
            6. "Transferência recebida pelo Pix - Wise Brasil Corretora de Câmbio Ltda. - 36.588.217/0001-01 - BCO VOTORANTIM S.A. (0655) Agência: 1 Conta: 1146184-5 - R$ 2500.00 - Categoria: WISE BRASIL CORRETORA
    
            A resposta deve ser única e exclusivamente a categoria correta, sem texto adicional. As categorias devem sempre estar em letras MAIÚSCULAS.
            Caso não seja identificado uma categoria, a resposta deve ser 'OUTROS'.`,
      },
      {
        role: "user",
        content: `Transação: Type: ${transaction.type}, Descrição: ${
          transaction.description
        }, Valor: ${transaction.amount.toFixed(2)}, Data: ${transaction.date}`,
      },
    ];
  } else {
    messages = [
      {
        role: "system",
        content: `Você é um assistente especializado em categorização de transações financeiras.
            A transação contém uma descrição, valor e data. Sua tarefa é identificar a categoria correta entre as seguintes: ${categoriesList.join(
              ", "
            )}.
    
            Aqui estão alguns exemplos de transações e suas respectivas categorias:
                1. "Transação: LUCAR VEICULOS EIRELI - ME - 28.356.395/0001-89 - BCO BRADESCO S.A. (0237) Agência: 1004 Conta: 4700-7, Valor: -12.000,00, Data: 01/02/2024" -> Categoria: CARRO
                2. "Transação: Transferência enviada pelo Pix - POSTO CASTELO - 29.937.742/0001-20 - BCO DO BRASIL S.A. (0001) Agência: 166 Conta: 123408-0, Valor: -217,01, Data: 12/03/2024" -> Categoria: RESTAURANTE
                3. "Transação: Transferência enviada pelo Pix - PARADA SAYONARA - 33.736.457/0001-18 - SICOOB CONEXÃO Agência: 3007 Conta: 375797-8, Valor: -53,00, Data: 12/03/2024" -> Categoria: LANCHE
                4. "Transação: Compra no débito - Delivery Canario, Valor: -153,00, Data: 30/03/2024" -> Categoria: LANCHE
                5. "Transação: Compra no débito - Churrascaria Porteira, Valor: -222,00, Data: 31/03/2024" -> Categoria: LANCHE

      
            A resposta deve ser única e exclusivamente a categoria correta, sem texto adicional. As categorias devem sempre estar em letras MAIÚSCULAS.
            Caso não seja identificado uma categoria, a resposta deve ser 'OUTROS'.`,
      },
      {
        role: "user",
        content: `Transação: Type: ${transaction.type}, Descrição: ${
          transaction.description
        }, Valor: ${transaction.amount.toFixed(2)}, Data: ${transaction.date}`,
      },
    ];
  }

  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ messages }),
      });

      const data = await response.json();
      console.log(" - ", data.choices[0].message.content.trim());
      return data.choices[0].message.content.trim();
    } catch (error) {
      if (attempt < retryCount - 1) {
        console.log(`Tentativa ${attempt + 1} falhou. Tentando novamente...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        console.error("Erro: Limite de tentativas atingido.");
        throw error;
      }
    }
  }
}

function formatTransactionDate(rawDate) {
  const year = rawDate.slice(0, 4);
  const month = rawDate.slice(4, 6);
  const day = rawDate.slice(6, 8);

  // Retorna a data no formato dd/mm/yyyy
  return `${day}/${month}/${year}`;
}

async function parseOFX(filePath) {
  try {
    const ofxData = fs.readFileSync(filePath, "utf8");
    const parsedData = OfxParser.parse(ofxData);

    const bankStatement = parsedData?.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS;

    if (!bankStatement || !bankStatement.BANKTRANLIST?.STMTTRN) {
      console.error(
        "Estrutura do OFX não contém transações ou conta bancária."
      );
      throw new Error("Erro: Não foi possível acessar as transações.");
    }

    const transactions = bankStatement.BANKTRANLIST.STMTTRN.map(
      (ofxTransaction) => {
        const rawDate = ofxTransaction.DTPOSTED;
        const formattedDate = formatTransactionDate(rawDate); // Formata a data
        const amount = parseFloat(ofxTransaction.TRNAMT);
        const description = ofxTransaction.MEMO || ofxTransaction.NAME;
        const type = ofxTransaction.TRNTYPE;

        if (formattedDate && !isNaN(amount) && description) {
          return {
            type: type,
            date: formattedDate, // Usa a data formatada
            amount,
            description,
          };
        } else {
          console.warn("Transação inválida encontrada:", ofxTransaction);
          return null;
        }
      }
    ).filter(Boolean);

    return transactions;
  } catch (error) {
    console.error("Erro ao processar arquivo OFX:", error);
    throw new Error("Erro ao processar arquivo OFX");
  }
}

async function categorizeWithLLM(transactions) {
  const categorized = { expenses: [], gains: [] };
  const categorySums = {};
  const gainCategorySums = {};

  const progressBar = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic
  );
  progressBar.start(transactions.length, 0);

  const promises = transactions.map(async (transaction, i) => {
    const isCredit = transaction.type == "CREDIT" || transaction.amount > 0;
    const category = await fetchCategory(transaction);

    const entry = {
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      category,
    };

    if (isCredit) {
      categorized.gains.push(entry);
      gainCategorySums[category] =
        (gainCategorySums[category] || 0) + transaction.amount;
    } else {
      categorized.expenses.push(entry);
      categorySums[category] =
        (categorySums[category] || 0) + Math.abs(transaction.amount);
    }

    progressBar.update(i + 1);
  });

  await Promise.all(promises);

  progressBar.stop();

  return { categorized, categorySums, gainCategorySums };
}

function summarize(transactions) {
  const totalIncome = transactions.reduce(
    (sum, t) => (t.amount > 0 ? sum + t.amount : sum),
    0
  );
  const totalExpenses = transactions.reduce(
    (sum, t) => (t.amount < 0 ? sum - t.amount : sum),
    0
  );

  return {
    total_income: totalIncome,
    total_expenses: totalExpenses,
    balance: totalIncome - totalExpenses,
    transaction_count: transactions.length,
  };
}

function createOutputFile(
  categorized,
  categorySums,
  gainCategorySums,
  monthYear
) {
  const outputPath = `${monthYear}.txt`;
  //   console.log(`MonthYear: ${monthYear}`);
  let content = "Gastos Detalhados:\n";

  categorized.expenses.forEach((expense) => {
    content += `${expense.date} - ${
      expense.description
    } - R$ ${expense.amount.toFixed(2)} - Categoria: ${expense.category}\n`;
  });

  content += "\nGanhos Detalhados:\n";
  categorized.gains.forEach((gain) => {
    content += `${gain.date} - ${gain.description} - R$ ${gain.amount.toFixed(
      2
    )} - Categoria: ${gain.category}\n`;
  });

  const summary = summarize([...categorized.expenses, ...categorized.gains]);
  const [month, year] = monthYear.split("_");

  content += `\n### ${getMonthName(month)} ${year}\n`;
  content += `Total de Ganhos: R$ ${summary.total_income.toFixed(2)}\n`;
  content += `Total de Gastos: R$ ${summary.total_expenses.toFixed(2)}\n`;
  content += `Saldo Atual: R$ ${summary.balance.toFixed(2)}\n`;
  content += `Número de Transações: ${summary.transaction_count}\n`;

  content += "\nResumo por Categoria de Gastos:\n";
  for (const [category, total] of Object.entries(categorySums)) {
    content += `Categoria: ${category} - Total Gasto: R$ ${total.toFixed(2)}\n`;
  }

  content += "\nResumo por Categoria de Ganhos:\n";
  for (const [category, total] of Object.entries(gainCategorySums)) {
    content += `Categoria: ${category} - Total Recebido: R$ ${total.toFixed(
      2
    )}\n`;
  }

  const patientSummary = summarizePatients(categorized.gains);
  content += "\nPacientes:\n";
  content += `Número de Pacientes: ${patientSummary.totalPatients}\n`;
  patientSummary.details.forEach((detail) => {
    content += `${detail.count} paciente(s) pagaram R$ ${detail.amount.toFixed(
      2
    )}\n`;
  });
  //   console.log(`PATCH PARA CRIAR ARQUIVO: ${outputPath}`);
  fs.writeFileSync(outputPath, content, { encoding: "utf-8" });
  console.log(`Arquivo TXT criado: ${outputPath}`);
}

function getMonthName(monthNumber) {
  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  return monthNames[parseInt(monthNumber, 10) - 1];
}

function summarizePatients(gains) {
  const patientCounts = {};

  gains.forEach((gain) => {
    if (gain.category == "PACIENTE") {
      patientCounts[gain.amount] = (patientCounts[gain.amount] || 0) + 1;
    }
  });

  const totalPatients = Object.values(patientCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  const details = Object.entries(patientCounts).map(([amount, count]) => ({
    amount: parseFloat(amount),
    count,
  }));

  return { totalPatients, details };
}

async function main() {
  const inputDir = path.resolve("extratos");
  const files = fs
    .readdirSync(inputDir)
    .filter((file) => file.endsWith(".ofx"));

  for (const file of files) {
    console.log(`Processando arquivo: ${file}`);

    const transactions = await parseOFX(path.join(inputDir, file));
    const { categorized, categorySums, gainCategorySums } =
      await categorizeWithLLM(transactions);

    const firstTransactionDate = transactions[0]?.date;
    console.log("firstTransactionDate: ", firstTransactionDate);

    if (firstTransactionDate) {
      const [day, month, year] = firstTransactionDate.split("/");

      const formattedMonth = month.padStart(2, "0");
      const monthYear = `${formattedMonth}_${year}`;

      createOutputFile(categorized, categorySums, gainCategorySums, monthYear);
    } else {
      console.error("Não foi possível determinar a data da transação.");
    }
  }
}

main().catch((error) => {
  console.error("Erro durante a execução:", error);
});
