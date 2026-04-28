import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# -----------------------------
#CARREGAMENTO E EXPLORAÇÃO
# -----------------------------
@st.cache_data
def load_data():
    df = pd.read_excel("NBA All Star Games (1).xlsx", sheet_name="Sheet1")
    return df

df = load_data()

st.title("Análise do NBA All-Star Game (2000–2016)")

st.markdown("""
###  
Este conjunto de dados contém informações sobre os jogadores selecionados para o NBA All-Star Game de 2000 a 2016.

As colunas representam:
- **Player**: nome do jogador selecionado
- **Team**: time da NBA em que o jogador atuava naquele ano
- **Year**: ano da edição do All-Star Game
- **Pos**: posição do jogador (ex: G, F, C)
- **Age**: idade do jogador
- **Height/Weight**: altura e peso
- **Nationality**: nacionalidade
- **Draft year/round**: informações sobre o ano e a rodada do draft
""")

# Exibir amostra dos dados
st.write("Exemplo dos dados:")
st.dataframe(df.head())



#ANÁLISE E VISUALIZAÇÃO
# -----------------------------

aba1, aba2 = st.tabs(["📊 Visualização Geral", "🔍 Buscar Jogador/Time"])

with aba1:
    st.markdown("### 🎯 Filtros para Visualização")
    year_range = st.slider("Filtrar por intervalo de anos:",
        min_value=int(df["Year"].min()),
        max_value=int(df["Year"].max()),
        value=(2000, 2016)
    )

    df_filtered = df[(df["Year"] >= year_range[0]) & (df["Year"] <= year_range[1])]

    col1, col2, col3 = st.columns(3)
    col1.metric("Total de Participações", len(df_filtered))
    col2.metric("Jogadores Únicos", df_filtered["Player"].nunique())
    col3.metric("Período", f"{df_filtered['Year'].min()}–{df_filtered['Year'].max()}")

    st.markdown("#### 👑 Jogadores Mais Selecionados")
    st.bar_chart(df_filtered["Player"].value_counts().head(10))

    st.markdown("#### 🏢 Times com Mais Participações")
    st.bar_chart(df_filtered["Team"].value_counts().head(10))

    st.markdown("#### 📈 Evolução Anual de Participações")
    players_per_year = df_filtered.groupby("Year")["Player"].count()
    st.line_chart(players_per_year)

    st.markdown("#### 🧩 Distribuição por Posição")
    pos_counts = df_filtered["Pos"].value_counts()
    fig, ax = plt.subplots()
    ax.pie(pos_counts, labels=pos_counts.index, autopct="%1.1f%%", startangle=90)
    ax.axis("equal")
    st.pyplot(fig)

    st.markdown("#### 🌍 Nacionalidades Mais Frequentes")
    st.bar_chart(df_filtered["Nationality"].value_counts().head(10))

    st.info("Todos os gráficos acima refletem apenas os dados dentro do intervalo de anos selecionado.")

with aba2:
    st.markdown("### 🔎 Pesquisar por Jogador ou Time")

    player_selected = st.selectbox("Escolha um jogador:", sorted(df_filtered["Player"].unique()))
    st.write(f"Participações de **{player_selected}**:")
    st.dataframe(df_filtered[df_filtered["Player"] == player_selected])

    team_selected = st.selectbox("Escolha um time:", sorted(df_filtered["Team"].unique()))
    st.write(f"Participações do **{team_selected}**:")
    st.dataframe(df_filtered[df_filtered["Team"] == team_selected])

