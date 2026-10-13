# ---- build ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ChatApi/ChatApi.csproj ChatApi/
RUN dotnet restore ChatApi/ChatApi.csproj
COPY ChatApi/ ChatApi/
RUN dotnet publish ChatApi/ChatApi.csproj -c Release -o /app --no-restore

# ---- runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "ChatApi.dll"]
